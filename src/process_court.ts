//Lots of good information here: https://github.com/freelawproject/courtlistener/blob/main/cl/people_db/models.py

import { Client } from 'pg';
import { Id, Ipfs, SystemIds, Relation, Triple, DataBlock, Position, PositionRange } from "@graphprotocol/grc-20";
import { deploySpace } from "./deploy-space";
import { publish } from "./publish";
import { format, parse } from 'date-fns';



async function getTypeInfo(
    typeName: string,
    client
): string {
    
    let res;
    let typeId;
    
    res = await client.query(`
        SELECT * 
        FROM cl_types
        WHERE name ILIKE $1
    `, [typeName]);
    
    return res.rows[0].geo_id

}

async function getSourceInfo(
    sourceName: string,
    client
): string {
    
    let res;
    let typeId;
    
    res = await client.query(`
        SELECT * 
        FROM sources_list
        WHERE name ILIKE $1
    `, [sourceName]);
    
    return res.rows[0].geo_id

}

async function getPropertyInfo(
    objectName: string,
    propertyName: string, 
    propertyChoice: string | null, 
    client
): [propertyId: string, choiceId: string] {
    
    let res;
    let propertyId;
    let choiceId;
    
    res = await client.query(`
        SELECT * 
        FROM all_properties
        WHERE TRIM(name) ILIKE TRIM($1)
        AND TRIM(propertyof) ILIKE TRIM($2)
    `, [propertyName, objectName]);

    if (res.rows.length > 0) {

        propertyId = res.rows[0].geo_id
    
        if (propertyChoice != null) {
            res = await client.query(`
                    SELECT * 
                    FROM ${res.rows[0].choices}
                    WHERE TRIM(key) ILIKE TRIM($1)
                    OR TRIM(value) ILIKE TRIM($1)
                `, [propertyChoice]);
        
            if (res.rows.length > 0) {
                choiceId = res.rows[0].geo_id;
            } else {
                choiceId = null;
                console.error("ERROR IN getPropertyInfo: No results from CHOICES SQL query")
            }
        } else{
            choiceId = null;
        }
    
        return [propertyId, choiceId]
    } else {
        console.error("ERROR IN getPropertyInfo: No results from all_properties SQL query")
        return [null, null]
    }

}

function getDateFormat(format: string): string | null{
    if (!format) return null; // Handle missing format
    switch (format) {
        case "%Y": return "yyyy"; // Year only
        case "%Y-%m": return "MMMM yyyy"; // Month and year
        case "%Y-%m-%d": return "MMMM d, yyyy"; // Full date
        default:
            return null;
    }
}

function postDate(
    entityId: string,
    propertyId: string, 
    date: string, 
    format: string | null
): addOp {
    let addOp;
    if ((date != null) && (date != "")) {
        date = date.toISOString().split("T")[0] + "T00:00:00.000Z"
        format = getDateFormat(format)
        if (!format) {
            addOp = Triple.make({
                entityId: entityId,
                attributeId: propertyId,
                value: {
                    type: "TIME",
                    value: date,
                    options: {
                        format: "MMMM d, yyyy",
                    }
                },
            });
        } else {
            addOp = Triple.make({
                entityId: entityId,
                attributeId: propertyId,
                value: {
                    type: "TIME",
                    value: date,
                    options: {
                        format: format,
                    }
                },
            });
        }
    }

    return addOp
}

async function addDataBlockToCourt(courtEntity, client, court_id): Array<Op> {
    const ops: Array<Op> = [];    
    let addOps;
    //const testSpaceId = "YRPckind3wVHcowVvbfx5X";
    const usLawSpaceId = "Q5YFEacgaHtXE9Kub9AEkA";
    const worksAtId = "U1uCAzXsRSTP4vFwo1JwJG";
    const workedAtId = "8fvqALeBDwEExJsDeTcvnV";
    let propertyId;
    let choiceId;

    //CREATE CURRENT JUDGES TABLE
    //CREATE THE DATA BLOCK
    let position = Position.createBetween();
    let blockOps = DataBlock.make({
        fromId: courtEntity,
        sourceType: 'QUERY',
        name: "Current Judges",
        position: position,
    });
    ops.push(...blockOps);
    
    //console.log(blockOps)
    let blockId = blockOps[2].relation.toEntity;
    let blockRelationId = blockOps[2].relation.id;

    let judgeTypeId = await getTypeInfo("Judge", client);
    //SET THE FILTERS FOR THE DATA BLOCK
    let filter = `{"where":{"spaces":["${usLawSpaceId}"],"AND":[{"attribute":"${SystemIds.TYPES_PROPERTY}","is":"${judgeTypeId}"},{"attribute":"${worksAtId}","is":"${courtEntity}"}]}}`
    //NOTE NEED TO ADD TYPE IS JUDGE TO THIS, BUT NOW IT CAN BE PERSON
    addOps = Triple.make({
            entityId: blockId,
            attributeId: SystemIds.FILTER,
            value: {
                type: "TEXT",
                value: filter,
            },
        });
    
    ops.push(addOps);

    //Set view to TABLE_VIEW -- for list view use SystemIds.LIST_VIEW
    addOps = Relation.make({
        fromId: blockRelationId,
        toId: SystemIds.GALLERY_VIEW,
        relationTypeId: SystemIds.VIEW_PROPERTY,
    });
    ops.push(addOps);

    //CREATE PAST JUDGES TABLE
    //CREATE THE DATA BLOCK
    position = Position.createBetween();
    blockOps = DataBlock.make({
        fromId: courtEntity,
        sourceType: 'QUERY',
        name: "Past Judges",
        position: position 
    });
    ops.push(...blockOps);
    
    //console.log(blockOps)
    blockId = blockOps[2].relation.toEntity
    blockRelationId = blockOps[2].relation.id

    judgeTypeId = await getTypeInfo("Judge", client);
    //SET THE FILTERS FOR THE DATA BLOCK
    filter = `{"where":{"spaces":["${usLawSpaceId}"],"AND":[{"attribute":"${SystemIds.TYPES_PROPERTY}","is":"${judgeTypeId}"},{"attribute":"${workedAtId}","is":"${courtEntity}"}]}}`
    //NOTE NEED TO ADD TYPE IS JUDGE TO THIS, BUT NOW IT CAN BE PERSON
    addOps = Triple.make({
        entityId: blockId,
        attributeId: SystemIds.FILTER,
        value: {
            type: "TEXT",
            value: filter,
        },
    });
    
    ops.push(addOps);

    //Set view to TABLE_VIEW -- for list view use SystemIds.LIST_VIEW
    addOps = Relation.make({
        fromId: blockRelationId,
        toId: SystemIds.TABLE_VIEW,
        relationTypeId: SystemIds.VIEW_PROPERTY,
    });
    ops.push(addOps);

    let columns_list = ["Gender", "Ethnicity", "Political affiliation"];
    for (const col of columns_list) {
        [propertyId, choiceId] = await getPropertyInfo("Judge", col, null, client)
        addOps = Relation.make({
            fromId: blockRelationId,
            toId: propertyId,
            relationTypeId: SystemIds.SHOWN_COLUMNS,
        });
        ops.push(addOps);
    }
    
    //CREATE OPINIONS TABLE
    //CREATE THE DATA BLOCK
    position = Position.createBetween();
    blockOps = DataBlock.make({
        fromId: courtEntity,
        sourceType: 'QUERY',
        name: "Court Opinions",
        position: position
    });
    ops.push(...blockOps);
    
    //console.log(blockOps)
    blockId = blockOps[2].relation.toEntity
    blockRelationId = blockOps[2].relation.id

    //SET THE FILTERS FOR THE DATA BLOCK
    let opinionGroupTypeId = await getTypeInfo("Opinion Group", client);
    [propertyId, choiceId] = await getPropertyInfo("Opinion group", "Assigned court", null, client);
    filter = `{"where":{"spaces":["${usLawSpaceId}"],"AND":[{"attribute":"${SystemIds.TYPES_PROPERTY}","is":"${opinionGroupTypeId}"},{"attribute":"${propertyId}","is":"${courtEntity}"}]}}`
    //NOTE NEED TO ADD TYPE IS JUDGE TO THIS, BUT NOW IT CAN BE PERSON
    addOps = Triple.make({
        entityId: blockId,
        attributeId: SystemIds.FILTER,
        value: {
            type: "TEXT",
            value: filter,
        },
    });
    
    ops.push(addOps);

    //Set view to TABLE_VIEW -- for list view use SystemIds.LIST_VIEW
    addOps = Relation.make({
        fromId: blockRelationId,
        toId: SystemIds.TABLE_VIEW,
        relationTypeId: SystemIds.VIEW_PROPERTY,
    });
    ops.push(addOps);

    if (court_id == "scotus") {
        columns_list = ["Judges", "Decision leaning", "Date filed"];
    } else {
        columns_list = ["Judges", "Date filed"];
    }
    for (const col of columns_list) {
        [propertyId, choiceId] = await getPropertyInfo("Opinion group", col, null, client)
        addOps = Relation.make({
            fromId: blockRelationId,
            toId: propertyId,
            relationTypeId: SystemIds.SHOWN_COLUMNS,
        });
        ops.push(addOps);
    }

    //CREATE OPINIONS TABLE
    //CREATE THE DATA BLOCK
    position = Position.createBetween();
    blockOps = DataBlock.make({
        fromId: courtEntity,
        sourceType: 'QUERY',
        name: "Court Dockets",
        position: position
    });
    ops.push(...blockOps);
    
    //console.log(blockOps)
    blockId = blockOps[2].relation.toEntity
    blockRelationId = blockOps[2].relation.id

    //SET THE FILTERS FOR THE DATA BLOCK
    let docketTypeId = await getTypeInfo("Docket", client);
    [propertyId, choiceId] = await getPropertyInfo("Docket", "Assigned court", null, client);
    filter = `{"where":{"spaces":["${usLawSpaceId}"],"AND":[{"attribute":"${SystemIds.TYPES_PROPERTY}","is":"${docketTypeId}"},{"attribute":"${propertyId}","is":"${courtEntity}"}]}}`
    //NOTE NEED TO ADD TYPE IS JUDGE TO THIS, BUT NOW IT CAN BE PERSON
    addOps = Triple.make({
        entityId: blockId,
        attributeId: SystemIds.FILTER,
        value: {
            type: "TEXT",
            value: filter,
        },
    });
    
    ops.push(addOps);

    //Set view to TABLE_VIEW -- for list view use SystemIds.LIST_VIEW
    addOps = Relation.make({
        fromId: blockRelationId,
        toId: SystemIds.TABLE_VIEW,
        relationTypeId: SystemIds.VIEW_PROPERTY,
    });
    ops.push(addOps);

    columns_list = ["Docket number", "Opinions"];
    for (const col of columns_list) {
        [propertyId, choiceId] = await getPropertyInfo("Docket", col, null, client)
        addOps = Relation.make({
            fromId: blockRelationId,
            toId: propertyId,
            relationTypeId: SystemIds.SHOWN_COLUMNS,
        });
        ops.push(addOps);
    }
    
    return ops;
}



//ADD a dockets table to the courts page


async function addSources(court, newGeoId, client, include_fjc: boolean = true): Array<Op> {
    const ops: Array<Op> = [];
    let addOps;
    let sourceId;
    let relationId;
    let propertyId;
    let choiceId;

    sourceId = await getSourceInfo("Court Listener", client)
    if (sourceId != null) {
        //ADD SOURCE INFORMATION
        addOps = Relation.make({
            fromId: newGeoId,
            toId: sourceId,
            relationTypeId: "A7NJF2WPh8VhmvbfVWiyLo", //SystemIds.SOURCES_PROPERTY
        });
        relationId = addOps.relation.id;
        ops.push(addOps)

        if (court.id != null) {
            [propertyId, choiceId] = await getPropertyInfo("source", "Database identifier", null, client);
            addOps = Triple.make({
                entityId: relationId,
                attributeId: propertyId,
                value: {
                    type: "TEXT",
                    value: court.id.toString(),
                },
            });
            ops.push(addOps)

            addOps = Triple.make({
                entityId: relationId,
                attributeId: SystemIds.DESCRIPTION_PROPERTY,
                value: {
                    type: "TEXT",
                    value: "Court",
                },
            });
            ops.push(addOps)
        }
    }

    return ops;
}





// DEFINE NECESSARY CONSTANTS
//const spaceId = "YRPckind3wVHcowVvbfx5X"; // Testnet
const spaceId = "Q5YFEacgaHtXE9Kub9AEkA"; // Mainnet
const walletAddress = "0x0A77FD6b13d135426c25E605a6A4F39AF72fD967";

const defaultCourtImageId = "V57bURTE52Y6xzQpV2ietA";

const webURLPropertyId = "93stf6cgYvBsdPruRzq1KK"

export async function processCourt(inputId, client): [Array<Op>, string] {
    try {
        console.log("BEGIN COURT")
        const ops: Array<Op> = [];
        // Query to select all people
        //const res = await client.query('SELECT id FROM people_db_person');
        const res = await client.query(`
            SELECT * 
            FROM search_court 
            WHERE id in ($1)
        `, [inputId]);
        const courts = res.rows;

        // Iterate through each person and update with a new geo_id
        for (const court of courts) {
            
            console.log(`\n------\nNEWCOURT\n------\n`);
            console.log(`\n------\nCOURT ID: ${court.id}\n------\n`);

            let propertyId;
            let choiceId;
            let typeId;
            let relationId;
            let addOps;
            let newGeoId: string; 
            let geoId;
            
            if (!court.geo_id){
                newGeoId = Id.generate();
            
                //Create Entity and set the name
                addOps = Triple.make({
            		entityId: newGeoId,
                    attributeId: SystemIds.NAME_PROPERTY,
            		value: {
            			type: "TEXT",
            			value: court.full_name,
            		},
            	});
                ops.push(addOps);

                addOps = await addDataBlockToCourt(newGeoId, client, court.id)
                ops.push(...addOps)
                
                if ((court.start_date != null) && (court.start_date != "")) {
                    [propertyId, choiceId] = await getPropertyInfo("court", "Start time", null, client)
                    addOps = postDate(newGeoId, propertyId, court.start_date, null)
                    ops.push(addOps);
                }

                if ((court.end_date != null) && (court.end_date != "")) {
                    [propertyId, choiceId] = await getPropertyInfo("court", "End time", null, client)
                    addOps = postDate(newGeoId, propertyId, court.end_date, null)
                    ops.push(addOps);
                }

                if (defaultCourtImageId != "") {
                    addOps = Relation.make({
                        fromId: newGeoId,
                        toId: defaultCourtImageId,
                        relationTypeId: "7YHk6qYkNDaAtNb8GwmysF", //COVER PROPERTY
                    });
                    ops.push(addOps);
                }

                if ((court.url != null) && (court.url != "")) {
                    //if not null, set url
                    [propertyId, choiceId] = await getPropertyInfo("court", "Website", null, client)
                    addOps = Triple.make({
                		entityId: newGeoId,
                        attributeId: propertyId,
                		value: {
                			type: "URL",
                			value: court.url,
                		},
                	});
                    ops.push(addOps);
                }
    
                if ((court.citation_string != null) && (court.citation_string != "")) {
                    //if not null, set citation abbreviation
                    [propertyId, choiceId] = await getPropertyInfo("court", "Citation abbreviation", null, client);
                    addOps = Triple.make({
                		entityId: newGeoId,
                        attributeId: propertyId,
                		value: {
                			type: "TEXT",
                			value: court.citation_string,
                		},
                	});
                    ops.push(addOps);
                }

                //set Types relation to court property
                typeId = await getTypeInfo("Court", client)
                addOps = Relation.make({
            		fromId: newGeoId,
            		toId: typeId,
            		relationTypeId: SystemIds.TYPES_ATTRIBUTE,
            	});
                ops.push(addOps);

                ////Add US COURTS AS RELATED SPACE
                //typeId = await getTypeInfo("Court", client)
                //addOps = Relation.make({
            	//	fromId: newGeoId,
            	//	toId: "SsiVw8DRXcrwacPx3seRWP", // US COURTS SPACE ENTITY ID
            	//	relationTypeId: "CHwmK8bk4KMCqBNiV2waL9", // RELATED SPACE PROPERTY ID
            	//});
                //ops.push(addOps);

                
    
                if ((court.jurisdiction != null) && (court.jurisdiction != "")) {
                    //if not null, relate to respective jurisdiction property
                    [propertyId, choiceId] = await getPropertyInfo("court", "Jurisdiction", court.jurisdiction, client);
                    if (choiceId != null) {
                        addOps = Relation.make({
                    		fromId: newGeoId,
                    		toId: choiceId,
                    		relationTypeId: propertyId,
                    	});
                        ops.push(addOps);

                        relationId = addOps.relation.id;
                        addOps = await addSources(court, relationId, client);
                        ops.push(...addOps);
                    }
                }

                addOps = await addSources(court, newGeoId, client);
                ops.push(...addOps);
                

                if (false) {
                
                    // Once you have the ops you can publish them to IPFS and your space.
                    const txHash = await publish({
                        spaceId,
                        author: walletAddress,
                        editName: `Add court ${court.full_name}`,
                        ops: ops, // An edit accepts an array of Ops
                    });
                    console.log("Your transaction hash is:", txHash);

                }
                
                //// Update the person with the new geo_id
                await client.query('UPDATE search_court SET geo_id = $1 WHERE id = $2', [newGeoId, court.id]);
                await client.query('UPDATE search_court SET edited = $1 WHERE id = $2', [true, court.id]);
                console.log(`Updated Court ID ${court.id} with geo_id ${newGeoId}`);

                //NOTE I NEED TO ADD APPEALS TO AND RECEVIES APPEALS FROM HERE...
                const appealsToRes = await client.query(`
                    SELECT * 
                    FROM search_court_appeals_to 
                    WHERE from_court_id in ($1)
                `, [inputId]);
                const higherCourts = appealsToRes.rows;
                for (const higherCourt of higherCourts) {
                    [propertyId, choiceId] = await getPropertyInfo("court", "Appeals to", null, client);
                    [addOps, geoId] = await processCourt(higherCourt.to_court_id, client);
                    ops.push(...addOps);
                    
                    if (geoId != null) {
                        addOps = Relation.make({
                            fromId: newGeoId,
                            toId: geoId,
                            relationTypeId: propertyId,
                        });
                        ops.push(addOps);

                        relationId = addOps.relation.id;
                        addOps = await addSources(court, relationId, client);
                        ops.push(...addOps);
                    }
                }

                const appealsFromRes = await client.query(`
                    SELECT * 
                    FROM search_court_appeals_to 
                    WHERE to_court_id in ($1)
                `, [inputId]);
                const lowerCourts = appealsFromRes.rows;
                for (const lowerCourt of lowerCourts) {
                    [propertyId, choiceId] = await getPropertyInfo("court", "Receives appeals from", null, client);
                    [addOps, geoId] = await processCourt(lowerCourt.from_court_id, client);
                    ops.push(...addOps);
                    
                    if (geoId != null) {
                        addOps = Relation.make({
                            fromId: newGeoId,
                            toId: geoId,
                            relationTypeId: propertyId,
                        });
                        ops.push(addOps);

                        relationId = addOps.relation.id;
                        addOps = await addSources(court, relationId, client);
                        ops.push(...addOps);
                    }
                }
                
                return [ops, newGeoId];
            } else {
                console.log(`Court ${court.id} Already exists with with geo_id ${court.geo_id}`);
                
                
                return [ops, court.geo_id];
            }
        }
    } catch (err) {
        console.error('Error updating court:', err);
        await client.query('UPDATE people_db_position SET geo_id = $1 WHERE edited = $2', [null, true]);
        await client.query('UPDATE people_db_person SET geo_id = $1 WHERE edited = $2', [null, true]);
        await client.query('UPDATE search_court SET geo_id = $1 WHERE edited = $2', [null, true]);
        await client.query('UPDATE audio_audio SET geo_id = $1 WHERE edited = $2', [null, true]);
        await client.query('UPDATE search_docket SET geo_id = $1 WHERE edited = $2', [null, true]);
        await client.query('UPDATE search_originatingcourtinformation SET geo_id = $1 WHERE edited = $2', [null, true]);
        await client.query('UPDATE search_opinion SET geo_id = $1 WHERE edited = $2', [null, true]);
        await client.query('UPDATE search_opinioncluster SET geo_id = $1 WHERE edited = $2', [null, true]);

        await client.query('UPDATE search_opinioncluster SET edited = $1 WHERE edited = $2', [false, true]);
        await client.query('UPDATE search_opinion SET edited = $1 WHERE edited = $2', [false, true]);
        await client.query('UPDATE search_originatingcourtinformation SET edited = $1 WHERE edited = $2', [false, true]);
        await client.query('UPDATE search_docket SET edited = $1 WHERE edited = $2', [false, true]);
        await client.query('UPDATE audio_audio SET edited = $1 WHERE edited = $2', [false, true]);
        await client.query('UPDATE search_court SET edited = $1 WHERE edited = $2', [false, true]);
        await client.query('UPDATE people_db_person SET edited = $1 WHERE edited = $2', [false, true]);
        await client.query('UPDATE people_db_position SET edited = $1 WHERE edited = $2', [false, true]);
        
    } 
}



