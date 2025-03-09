//Lots of good information here: https://github.com/freelawproject/courtlistener/blob/main/cl/people_db/models.py

import { Client } from 'pg';
import { Id, Ipfs, SystemIds, Relation, Triple, DataBlock, Position, PositionRange } from "@graphprotocol/grc-20";
import { deploySpace } from "./deploy-space";
import { publish } from "./publish";
import { processPerson } from "./process_person";
import { processCourt } from "./process_court";
import { processArgument } from "./process_argument";
import { format, parse } from 'date-fns';
import { processCitations } from "./process_citations";


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
                console.error(`ERROR IN getPropertyInfo for ${propertyName}: No results from CHOICES ${propertyChoice} SQL query`)
            }
        } else{
            choiceId = null;
        }
    
        return [propertyId, choiceId]
    } else {
        console.error(`ERROR IN getPropertyInfo for ${propertyName}: No results from all_properties SQL query`)
        return [null, null]
    }

}

function getDateFormat(format: string): string | null{
    if (!format) return null; // Handle missing format
    switch (format) {
        case "%Y": return "yyyy"; // Year only
        case "%Y-%m": return "yyyy - MM"; // Month and year
        case "%Y-%m-%d": return "yyyy - MM - dd"; // Full date
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
                        format: "yyyy - MM - dd",
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

async function addSources(docket, newGeoId, client, include_fjc: boolean = true): Array<Op> {
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
        ops.push(addOps);

        if (docket.id != null) {
            [propertyId, choiceId] = await getPropertyInfo("source", "Database identifier", null, client);
            addOps = Triple.make({
                entityId: relationId,
                attributeId: propertyId,
                value: {
                    type: "TEXT",
                    value: docket.id.toString(),
                },
            });
            ops.push(addOps)

            addOps = Triple.make({
                entityId: relationId,
                attributeId: SystemIds.DESCRIPTION_PROPERTY,
                value: {
                    type: "TEXT",
                    value: "Originating court",
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

const endTimePropertyId = "R7X9rnVW49g29XvK5KMTtP";
const startTimePropertyId = "6cF7TMDBFwSt5vMENU3Cta";

const worksAtId = "U1uCAzXsRSTP4vFwo1JwJG";
const workedAtId = "8fvqALeBDwEExJsDeTcvnV";

const webURLPropertyId = "93stf6cgYvBsdPruRzq1KK";

export async function processOrigDocket(inputId, client): [Array<Op>, string] {
    try {
        console.log("BEGIN ORIGINATING COURT")
        const ops: Array<Op> = [];
        let addOps;
        
        let res;
        let fjc_link = false;
        res = await client.query(`
            SELECT 
                *
            FROM search_originatingcourtinformation
            WHERE id = $1
        `, [inputId]);

        

        const dockets = res.rows;
        
        // Iterate through each person and update with a new geo_id
        for (const docket of dockets) {
            
            console.log(`\n------\nNEW ORIGINAL DOCKET ID: ${docket.id}\n------\n`);

            
            let propertyId;
            let choiceId;
            let typeId;
            let relationId;
            let newGeoId: string;
            let addVar;
            let geoId;
            
            if (!docket.geo_id){
                newGeoId = Id.generate();

                if ((docket.docket_number != null) && (docket.docket_number != "")) {
                    //Create Entity and set the name
                    addOps = Triple.make({
                        entityId: newGeoId,
                        attributeId: SystemIds.NAME_PROPERTY,
                        value: {
                            type: "TEXT",
                            value: "Lower Court Docket - " + docket.docket_number,
                        },
                    });
                    ops.push(addOps);

                    [propertyId, choiceId] = await getPropertyInfo("docket", "Docket number", null, client)
                    //Create Entity and set the name
                    addOps = Triple.make({
                		entityId: newGeoId,
                        attributeId: propertyId,
                		value: {
                			type: "TEXT",
                			value: docket.docket_number,
                		},
                	});
                    ops.push(addOps);
                        
                } else {
                    //Create Entity and set the name
                    addOps = Triple.make({
                		entityId: newGeoId,
                        attributeId: SystemIds.NAME_PROPERTY,
                		value: {
                			type: "TEXT",
                			value: "Lower Court Docket - " + docket.id,
                		},
                	});
                    ops.push(addOps);
                }

                addOps = Relation.make({
                    fromId: newGeoId,
                    toId: await getTypeInfo("Docket", client),
                    relationTypeId: SystemIds.TYPES_PROPERTY,
                });
                ops.push(addOps);
                

                if ((docket.assigned_to_id != null) && (docket.assigned_to_id != "")) {

                    [propertyId, choiceId] = await getPropertyInfo("docket", "Assigned to", null, client);
                    [addOps, geoId] = await processPerson(docket.assigned_to_id, client);
                    ops.push(...addOps);
                    
                    if (geoId != null) {
                        addOps = Relation.make({
                            fromId: newGeoId,
                            toId: geoId,
                            relationTypeId: propertyId,
                        });
                        ops.push(addOps);

                        relationId = addOps.relation.id;
                        addOps = await addSources(docket, newGeoId, client);
                        ops.push(...addOps);
                    }
                }
                
                if ((docket.ordering_judge_id != null) && (docket.ordering_judge_id != "")) {

                    [propertyId, choiceId] = await getPropertyInfo("docket", "Ordering judge", null, client);
                    [addOps, geoId] = await processPerson(docket.ordering_judge_id, client);
                    ops.push(...addOps);
                    
                    if (geoId != null) {
                        addOps = Relation.make({
                            fromId: newGeoId,
                            toId: geoId,
                            relationTypeId: propertyId,
                        });
                        ops.push(addOps);

                        relationId = addOps.relation.id;
                        addOps = await addSources(docket, newGeoId, client);
                        ops.push(...addOps);
                    }
                }


                if ((docket.date_filed != null) && (docket.date_filed != "")) {
                    [propertyId, choiceId] = await getPropertyInfo("docket", "Date filed", null, client)
                    addOps = postDate(newGeoId, propertyId, docket.date_filed, null)
                    ops.push(addOps);
                }

                if ((docket.date_disposed != null) && (docket.date_disposed != "")) {
                    [propertyId, choiceId] = await getPropertyInfo("docket", "Date disposed", null, client)
                    addOps = postDate(newGeoId, propertyId, docket.date_filed, null)
                    ops.push(addOps);
                }

                if ((docket.date_judgment != null) && (docket.date_judgment != "")) {
                    [propertyId, choiceId] = await getPropertyInfo("docket", "Date judgement", null, client)
                    addOps = postDate(newGeoId, propertyId, docket.date_judgment, null)
                    ops.push(addOps);
                } else if ((docket.date_judgment_eod != null) && (docket.date_judgment_eod != "")) { 
                    [propertyId, choiceId] = await getPropertyInfo("docket", "Date judgement", null, client)
                    addOps = postDate(newGeoId, propertyId, docket.date_judgment_eod, null)
                    ops.push(addOps);
                }

                if ((docket.date_filed_noa != null) && (docket.date_filed_noa != "")) {
                    [propertyId, choiceId] = await getPropertyInfo("docket", "Date notice of appeal filed", null, client)
                    addOps = postDate(newGeoId, propertyId, docket.date_filed_noa, null)
                    ops.push(addOps);
                }

                if ((docket.date_received_coa != null) && (docket.date_received_coa != "")) {
                    [propertyId, choiceId] = await getPropertyInfo("docket", "Date received by court of appeals", null, client)
                    addOps = postDate(newGeoId, propertyId, docket.date_received_coa, null)
                    ops.push(addOps);
                }

                addOps = await addSources(docket, newGeoId, client);
                ops.push(...addOps);

                if (false) {
                    // Once you have the ops you can publish them to IPFS and your space.
                    const txHash = await publish({
                        spaceId,
                        author: walletAddress,
                        editName: `Add lower court docket ${docket.docket_number}`,
                        ops: ops, // An edit accepts an array of Ops
                    });
                    console.log("Your transaction hash is:", txHash);
                }
                
                //// Update the person with the new geo_id
                await client.query('UPDATE search_originatingcourtinformation SET geo_id = $1 WHERE id = $2', [newGeoId, docket.id]);
                await client.query('UPDATE search_originatingcourtinformation SET edited = $1 WHERE id = $2', [true, docket.id]);
                console.log(`Updated Lower Court Docket ID ${docket.id} with geo_id ${newGeoId}`);

                return [ops, newGeoId];
            } else {
                return [ops, docket.geo_id];
            }
            
            
        }
    } catch (err) {
        console.error('Error updating Lower Court Docket:', err);
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
