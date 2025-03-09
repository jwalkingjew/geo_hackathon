//Lots of good information here: https://github.com/freelawproject/courtlistener/blob/main/cl/people_db/models.py

import { Client } from 'pg';
import { Image, Id, Ipfs, SystemIds, Relation, Triple, Position, TextBlock, DataBlock, PositionRange } from "@graphprotocol/grc-20";
import { deploySpace } from "./deploy-space";
import { publish } from "./publish";
import { processPerson } from "./process_person";
import { processCourt } from "./process_court";
import { processDocket } from "./process_docket";
import { processOpinion } from "./process_opinion";
import { processCitations } from "./process_citations";
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

function formatTranscriptToMarkdown(transcript: string): string {
    return transcript
        // Add a newline before each new speaker
        .replace(/(\w+):/g, "\n### $1\n") 
        // Convert dialogue into blockquotes
        .replace(/\n([^\n]+)/g, "\n> $1") 
        // Trim extra spaces and clean up
        .trim();
}

export const createContent = (entityId: string, content: string[]) => {
    const ops = [];
    for(let i = 0; i < content.length; i++) {
        const position = Position.createBetween();
        let blockOps = TextBlock.make({
            fromId: entityId,
            text: content[i],
            position,
        });
        ops.push(...blockOps);
    }
    return ops;
}

async function addSources(arg, newGeoId, client, include_fjc: boolean = true): Array<Op> {
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

        if (arg.id != null) {
            [propertyId, choiceId] = await getPropertyInfo("source", "Database identifier", null, client);
            addOps = Triple.make({
                entityId: relationId,
                attributeId: propertyId,
                value: {
                    type: "TEXT",
                    value: arg.id.toString(),
                },
            });
            ops.push(addOps)

            addOps = Triple.make({
                entityId: relationId,
                attributeId: SystemIds.DESCRIPTION_PROPERTY,
                value: {
                    type: "TEXT",
                    value: "Oral argument",
                },
            });
            ops.push(addOps)

            if ((arg.local_path_mp3 != null) && (arg.local_path_original_file != "")) {
                addOps = Triple.make({
                    entityId: relationId,
                    attributeId: webURLPropertyId,
                    value: {
                        type: "URL",
                        value: `https://storage.courtlistener.com/${arg.local_path_mp3}`,
                    },
                });
                ops.push(addOps)
            } else if ((arg.local_path_original_file != null) && (arg.local_path_original_file != "")) {
                addOps = Triple.make({
                    entityId: relationId,
                    attributeId: webURLPropertyId,
                    value: {
                        type: "URL",
                        value: `https://storage.courtlistener.com/${arg.local_path_original_file}`,
                    },
                });
                ops.push(addOps)
            } 
            
            if ((arg.download_url != null) && (arg.download_url != "")) {
                [propertyId, choiceId] = await getPropertyInfo("argument", "Download URL", null, client)
                addOps = Triple.make({
                    entityId: relationId,
                    attributeId: propertyId,
                    value: {
                        type: "URL",
                        value: arg.download_url,
                    },
                });
                ops.push(addOps)
            }
        }
    }

    if ((arg.filepath_ia != null) && (arg.filepath_ia != "")) {
        sourceId = await getSourceInfo("Internet Archive", client)
        if (sourceId != null) {
            //ADD SOURCE INFORMATION
            addOps = Relation.make({
                fromId: newGeoId,
                toId: sourceId,
                relationTypeId: "A7NJF2WPh8VhmvbfVWiyLo", //SystemIds.SOURCES_PROPERTY
            });
            relationId = addOps.relation.id;
            ops.push(addOps)
        
            addOps = Triple.make({
                entityId: relationId,
                attributeId: "BTNv9aAFqAzDjQuf4u2fXK",
                value: {
                    type: "URL",
                    value: arg.filepath_ia,
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

const defaultArgImageId = "PT56MeAMXSqY9BRN5h993c";

const endTimePropertyId = "R7X9rnVW49g29XvK5KMTtP";
const startTimePropertyId = "6cF7TMDBFwSt5vMENU3Cta";

const worksAtId = "U1uCAzXsRSTP4vFwo1JwJG";
const workedAtId = "8fvqALeBDwEExJsDeTcvnV";

const webURLPropertyId = "93stf6cgYvBsdPruRzq1KK";

export async function processArgument(inputId, client): Array<Op> {
    try {
        console.log("BEGIN ARGUMENT") 
        const ops: Array<Op> = [];
        let addOps;
        
        let res;
        res = await client.query(`
            SELECT 
                *
            FROM audio_audio
            WHERE docket_id = $1
        `, [inputId]);
        

        const args = res.rows;
        
        // Iterate through each person and update with a new geo_id
        for (const arg of args) {
            
            console.log(`\n------\nNEWARGUMENT\n------\n`);

            let propertyId;
            let choiceId;
            let typeId;
            let relationId;
            let newGeoId: string;
            let addVar;
            let geoId;
            
            if (!arg.geo_id){
                newGeoId = Id.generate();
                addOps = Triple.make({
            		entityId: newGeoId,
                    attributeId: SystemIds.NAME_PROPERTY,
            		value: {
            			type: "TEXT",
            			value: "Argument - " + arg.case_name,
            		},
            	});
                ops.push(addOps);
                
                [propertyId, choiceId] = await getPropertyInfo("argument", "Case name", null, client)
                //Create Entity and set the name
                addOps = Triple.make({
            		entityId: newGeoId,
                    attributeId: propertyId,
            		value: {
            			type: "TEXT",
            			value: arg.case_name,
            		},
            	});
                ops.push(addOps);

                addOps = Relation.make({
                    fromId: newGeoId,
                    toId: await getTypeInfo("Argument", client),
                    relationTypeId: SystemIds.TYPES_PROPERTY,
                });
                ops.push(addOps);

                if (defaultArgImageId != "") {
                    addOps = Relation.make({
                        fromId: newGeoId,
                        toId: defaultArgImageId,
                        relationTypeId: "7YHk6qYkNDaAtNb8GwmysF", //COVER PROPERTY
                    });
                    ops.push(addOps);
                }

                if (arg.stt_status == 1) {
                    if ((arg.stt_transcript != null) && (arg.stt_transcript != "")) {
                        addOps = createContent(newGeoId, formatTranscriptToMarkdown(arg.stt_transcript).split("\n\n"));
                        ops.push(...addOps)
    
                        
                        addOps = Triple.make({
                    		entityId: newGeoId,
                            attributeId: SystemIds.DESCRIPTION_PROPERTY,
                    		value: {
                    			type: "TEXT",
                    			value: "Speech to text transcription completed using an OpenAI Whisper model.",
                    		},
                    	});
                        ops.push(addOps);
                        
                    }
                } else if (arg.stt_status == 4) { 
                    if ((arg.stt_transcript != null) && (arg.stt_transcript != "")) {
                        addOps = createContent(newGeoId, formatTranscriptToMarkdown(arg.stt_transcript).split("\n\n"));
                        ops.push(...addOps)
                    }

                    addOps = Triple.make({
                        entityId: newGeoId,
                        attributeId: SystemIds.DESCRIPTION_PROPERTY,
                        value: {
                            type: "TEXT",
                            value: "Speech to text transcription was too large (over 25 MB).",
                        },
                    });
                    ops.push(addOps);
                    
                } else {
                    addOps = Triple.make({
                        entityId: newGeoId,
                        attributeId: SystemIds.DESCRIPTION_PROPERTY,
                        value: {
                            type: "TEXT",
                            value: "Speech to text transcription has yet to be completed.",
                        },
                    });
                    ops.push(addOps);
                }

                if ((arg.docket_id != null) && (arg.docket_id != "")) {
                    [addOps, geoId] = await processDocket(arg.docket_id, client);
                    ops.push(...addOps);
                    
                    [propertyId, choiceId] = await getPropertyInfo("argument", "Docket", null, client)
                    if (geoId != null) {
                        addOps = Relation.make({
                            fromId: newGeoId,
                            toId: geoId,
                            relationTypeId: propertyId,
                        });
                        ops.push(addOps);
                        relationId = addOps.relation.id;
                        addOps = await addSources(arg, relationId, client);
                        ops.push(...addOps);
                    }
                    
                    [propertyId, choiceId] = await getPropertyInfo("docket", "Arguments", null, client)
                    if (geoId != null) {
                        addOps = Relation.make({
                            fromId: geoId,
                            toId: newGeoId,
                            relationTypeId: propertyId,
                        });
                        ops.push(addOps);

                        relationId = addOps.relation.id;
                        addOps = await addSources(arg, relationId, client);
                        ops.push(...addOps);
                    }
                }

                if ((arg.download_url != null) && (arg.download_url != "")) {

                    [propertyId, choiceId] = await getPropertyInfo("argument", "Download URL", null, client)
                    addOps = Triple.make({
                		entityId: newGeoId,
                        attributeId: propertyId,
                		value: {
                			type: "URL",
                			value: arg.download_url,
                		},
                	});
                    ops.push(addOps);
                } else if ((arg.local_path_mp3 != null) && (arg.local_path_original_file != "")) {
                    [propertyId, choiceId] = await getPropertyInfo("argument", "Download URL", null, client)
                    addOps = Triple.make({
                		entityId: newGeoId,
                        attributeId: propertyId,
                		value: {
                			type: "URL",
                			value: `https://storage.courtlistener.com/${arg.local_path_mp3}`,
                		},
                	});
                    ops.push(addOps);
                }

                if ((arg.filepath_ia != null) && (arg.filepath_ia != "")) {

                    addOps = Triple.make({
                		entityId: newGeoId,
                        attributeId: "BTNv9aAFqAzDjQuf4u2fXK",
                		value: {
                			type: "URL",
                			value: arg.filepath_ia,
                		},
                	});
                    ops.push(addOps);
                }

                if ((arg.duration != null) && (arg.duration != "") && (arg.duration != 0)) {

                    [propertyId, choiceId] = await getPropertyInfo("argument", "Duration (seconds)", null, client)
                    addOps = Triple.make({
                        entityId: newGeoId,
                        attributeId: propertyId,
                        value: {
                            type: "NUMBER",
                            value: arg.duration.toString(),
                        },
                    });
                    ops.push(addOps);                    
                }
                
                addOps = await addSources(arg, newGeoId, client);
                ops.push(...addOps);
                
                if (false) {

                    // Once you have the ops you can publish them to IPFS and your space.
                    const txHash = await publish({
                        spaceId,
                        author: walletAddress,
                        editName: `Add Argument ${arg.docket_id}`,
                        ops: ops, // An edit accepts an array of Ops
                    });
                    console.log("Your transaction hash is:", txHash);
                }
                
                //// Update the person with the new geo_id
                await client.query('UPDATE audio_audio SET geo_id = $1 WHERE id = $2', [newGeoId, arg.id]);
                await client.query('UPDATE audio_audio SET edited = $1 WHERE id = $2', [true, arg.id]);
                console.log(`Updated Argument ID ${arg.id} with geo_id ${newGeoId}`);
            } 
        }
        return ops
    } catch (err) {
        console.error('Error updating argument:', err);
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
