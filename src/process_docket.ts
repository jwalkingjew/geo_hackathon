//Lots of good information here: https://github.com/freelawproject/courtlistener/blob/main/cl/people_db/models.py

import { Client } from 'pg';
import { Id, Ipfs, SystemIds, Relation, Triple, DataBlock, Position, PositionRange } from "@graphprotocol/grc-20";
import { deploySpace } from "./deploy-space";
import { publish } from "./publish";
import { processPerson } from "./process_person";
import { processCourt } from "./process_court";
import { processArgument } from "./process_argument";
import { processOrigDocket } from "./process_originating_docket";
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

async function addSources(docket, newGeoId, client, include_idb: boolean = true): Array<Op> {
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
                    value: "Docket",
                },
            });
            ops.push(addOps)
            
            if ((docket.slug != null) && (docket.slug != "")) {
                addOps = Triple.make({
                    entityId: relationId,
                    attributeId: webURLPropertyId,
                    value: {
                        type: "URL",
                        value: `https://www.courtlistener.com/docket/${docket.id.toString()}/${docket.slug}`,
                    },
                });
                ops.push(addOps)
            }
            if ((docket.filepath_pdf_harvard != null) && (docket.filepath_pdf_harvard != "")) {
                addOps = Triple.make({
                    entityId: relationId,
                    attributeId: "BTNv9aAFqAzDjQuf4u2fXK",
                    value: {
                        type: "URL",
                        value: `https://storage.courtlistener.com/${docket.filepath_pdf_harvard}`,
                    },
                });
                ops.push(addOps)
            }
        }
    }

    if ((docket.filepath_ia != null) && (docket.filepath_ia != "")) {
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
                    value: docket.filepath_ia,
                },
            });
            ops.push(addOps)   
        }
    }

    if (include_idb) {
        if ((docket.idb_data_id != null) && (docket.idb_data_id != "")) {
            sourceId = await getSourceInfo("Federal Judicial Center", client)
            if (sourceId != null) {
                //ADD SOURCE INFORMATION
                addOps = Relation.make({
                    fromId: newGeoId,
                    toId: sourceId,
                    relationTypeId: "A7NJF2WPh8VhmvbfVWiyLo", //SystemIds.SOURCES_PROPERTY
                });
                relationId = addOps.relation.id;
                ops.push(addOps);
    
                [propertyId, choiceId] = await getPropertyInfo("source", "Database identifier", null, client);
                addOps = Triple.make({
                    entityId: relationId,
                    attributeId: propertyId,
                    value: {
                        type: "TEXT",
                        value: docket.idb_data_id.toString(),
                    },
                });
                ops.push(addOps)   
            }
            if ((docket.slug != null) && (docket.slug != "")) {
                    addOps = Triple.make({
                        entityId: relationId,
                        attributeId: webURLPropertyId,
                        value: {
                            type: "URL",
                            value: `https://www.courtlistener.com/docket/${docket.id.toString()}/idb/${docket.slug}`,
                        },
                    });
                    ops.push(addOps)
                }
        }
    }

    if ((docket.pacer_case_id != null) && (docket.pacer_case_id != "")) {
        sourceId = await getSourceInfo("Public Access to Court Electronic Records (PACER)", client)
        if (sourceId != null) {
            //ADD SOURCE INFORMATION
            addOps = Relation.make({
                fromId: newGeoId,
                toId: sourceId,
                relationTypeId: "A7NJF2WPh8VhmvbfVWiyLo", //SystemIds.SOURCES_PROPERTY
            });
            relationId = addOps.relation.id;
            ops.push(addOps);

            [propertyId, choiceId] = await getPropertyInfo("source", "Database identifier", null, client);
            addOps = Triple.make({
                entityId: relationId,
                attributeId: propertyId,
                value: {
                    type: "TEXT",
                    value: docket.pacer_case_id.toString(),
                },
            });
            ops.push(addOps)   
        }
        if ((docket.slug != null) && (docket.slug != "")) {
                addOps = Triple.make({
                    entityId: relationId,
                    attributeId: webURLPropertyId,
                    value: {
                        type: "URL",
                        value: `https://ecf.${docket.court_id}.uscourts.gov/cgi-bin/DktRpt.pl?${docket.pacer_case_id}`,
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

const defaultDocketImageId = "JW2tsV6YJu1m3Hp1VHxE9a";

const endTimePropertyId = "R7X9rnVW49g29XvK5KMTtP";
const startTimePropertyId = "6cF7TMDBFwSt5vMENU3Cta";

const worksAtId = "U1uCAzXsRSTP4vFwo1JwJG";
const workedAtId = "8fvqALeBDwEExJsDeTcvnV";

const webURLPropertyId = "93stf6cgYvBsdPruRzq1KK"
const databaseIdPropertyId = "2XaDUAbys7eBAMR168vw9L"

export async function processDocket(inputId: int, client): [Array<Op>, string] {
    try {
        console.log("BEGIN DOCKET")
        const ops: Array<Op> = [];
        let addOps;
        
        let res;
        let fjc_link = false;
        res = await client.query(`
            SELECT 
                idb_data_id
            FROM search_docket
            WHERE id = $1
        `, [inputId]);

        //NEED TO LOOK INTO WHETHER I CAN LINK THEM ON DOCKET NUMBER CORE AND FJC DOCKET NUMBER
        if(res.rows[0].idb_data_id != null) {
            res = await client.query(`
                SELECT 
                    d.*,
                    fjc.origin, fjc.nature_of_suit, fjc.jurisdiction, fjc.monetary_demand, fjc.arbitration_at_termination,
                    fjc.plaintiff, fjc.defendant, fjc.termination_class_action_status, fjc.procedural_progress, fjc.disposition,
                    fjc.nature_of_judgement, fjc.amount_received, fjc.judgment, fjc.pro_se, fjc.nature_of_offense, fjc.circuit_id,
                    fjc.district_id, fjc.transfer_docket_number
                FROM search_docket as d
                LEFT JOIN recap_fjcintegrateddatabase fjc ON fjc.id = d.idb_data_id
                WHERE d.id = $1
            `, [inputId]);
            fjc_link = true
        } else {
            res = await client.query(`
                SELECT 
                    *
                FROM search_docket
                WHERE id = $1
            `, [inputId]);
        }

        const dockets = res.rows;
        
        // Iterate through each person and update with a new geo_id
        for (const docket of dockets) {
            
            console.log(`\n------\nNEWDOCKET\n------\n`);

            
            let propertyId;
            let choiceId;
            let typeId;
            let relationId;
            let newGeoId: string;
            let addVar;
            let geoId;
            
            if (!docket.geo_id){
                newGeoId = Id.generate();
                
                if ((docket.case_name_full != null) && (docket.case_name_full != "")) {
                    addVar = docket.case_name_full
                } else if ((docket.case_name != null) && (docket.case_name != "")) {
                    addVar = docket.case_name
                } else {
                    addVar = docket.case_name_short
                }

                //Create Entity and set the name
                addOps = Triple.make({
            		entityId: newGeoId,
                    attributeId: SystemIds.NAME_PROPERTY,
            		value: {
            			type: "TEXT",
            			value: "Docket - " + addVar,
            		},
            	});
                ops.push(addOps);

                addOps = Relation.make({
                    fromId: newGeoId,
                    toId: await getTypeInfo("Docket", client),
                    relationTypeId: SystemIds.TYPES_PROPERTY,
                });
                ops.push(addOps);

                if (defaultDocketImageId!= "") {
                    addOps = Relation.make({
                        fromId: newGeoId,
                        toId: defaultDocketImageId,
                        relationTypeId: "7YHk6qYkNDaAtNb8GwmysF", //COVER PROPERTY
                    });
                    ops.push(addOps);
                }
                
                [propertyId, choiceId] = await getPropertyInfo("docket", "Case name", null, client)
                //Create Entity and set the name
                addOps = Triple.make({
            		entityId: newGeoId,
                    attributeId: propertyId,
            		value: {
            			type: "TEXT",
            			value: addVar,
            		},
            	});
                ops.push(addOps);

                if ((docket.court_id != null) && (docket.court_id != "")) {

                    [propertyId, choiceId] = await getPropertyInfo("docket", "Assigned court", null, client);
                    [addOps, geoId] = await processCourt(docket.court_id, client);
                    ops.push(...addOps);
                    
                    if (geoId != null) {
                        addOps = Relation.make({
                            fromId: newGeoId,
                            toId: geoId,
                            relationTypeId: propertyId,
                        });
                        ops.push(addOps);
                        relationId = addOps.relation.id;
                        addOps = await addSources(docket, relationId, client, false);
                        ops.push(...addOps);
                    }
                }
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
                        addOps = await addSources(docket, relationId, client, false);
                        ops.push(...addOps);
                    }
                }

                if ((docket.referred_to_id != null) && (docket.referred_to_id != "")) {

                    [propertyId, choiceId] = await getPropertyInfo("docket", "Referred to", null, client);
                    [addOps, geoId] = await processPerson(docket.referred_to_id, client);
                    ops.push(...addOps);
                    
                    if (geoId != null) {
                        addOps = Relation.make({
                            fromId: newGeoId,
                            toId: geoId,
                            relationTypeId: propertyId,
                        });
                        ops.push(addOps);
                        relationId = addOps.relation.id;
                        addOps = await addSources(docket, relationId, client, false);
                        ops.push(...addOps);
                    }
                }

                if ((docket.originating_court_information_id != null) && (docket.originating_court_information_id != "")) {
                    [addOps, geoId] = await processOrigDocket(docket.originating_court_information_id, client);
                    ops.push(...addOps);
                    
                    [propertyId, choiceId] = await getPropertyInfo("docket", "Originating docket", null, client)
                    if (geoId != null) {
                        addOps = Relation.make({
                            fromId: newGeoId,
                            toId: geoId,
                            relationTypeId: propertyId,
                        });
                        ops.push(addOps);

                        relationId = addOps.relation.id;
                        addOps = await addSources(docket, relationId, client, false);
                        ops.push(...addOps);
                    }

                    //link Parent docket in orig
                    [propertyId, choiceId] = await getPropertyInfo("docket", "Parent docket", null, client)
                    if (geoId != null) {
                        addOps = Relation.make({
                            fromId: geoId,
                            toId: newGeoId,
                            relationTypeId: propertyId,
                        });
                        ops.push(addOps);

                        relationId = addOps.relation.id;
                        addOps = await addSources(docket, relationId, client, false);
                        ops.push(...addOps);
                    }

                    
                }
                
                if ((docket.appeal_from_id != null) && (docket.appeal_from_id != "")) {

                    [propertyId, choiceId] = await getPropertyInfo("docket", "Appeal from", null, client);
                    [addOps, geoId] = await processCourt(docket.appeal_from_id, client);
                    ops.push(...addOps);
                    
                    if (geoId != null) {
                        addOps = Relation.make({
                            fromId: newGeoId,
                            toId: geoId,
                            relationTypeId: propertyId,
                        });
                        ops.push(addOps);
                    }

                    relationId = addOps.relation.id;
                    addOps = await addSources(docket, relationId, client, false);
                    ops.push(...addOps);
                }

                if ((docket.federal_defendant_number != null) && (docket.federal_defendant_number != "")) {

                    [propertyId, choiceId] = await getPropertyInfo("docket", "Defendant number", null, client)
                    addOps = Triple.make({
                		entityId: newGeoId,
                        attributeId: propertyId,
                		value: {
                			type: "TEXT",
                			value: docket.federal_defendant_number.toString(),
                		},
                	});
                    ops.push(addOps);
                }

                if ((docket.parent_docket_id != null) && (docket.parent_docket_id != "")) {

                    [propertyId, choiceId] = await getPropertyInfo("docket", "Parent docket", null, client);
                    [addOps, geoId] = await processDocket(docket.parent_docket_id, client);
                    ops.push(...addOps);
                    
                    addOps = Relation.make({
                        fromId: newGeoId,
                        toId: geoId,
                        relationTypeId: propertyId,
                    });
                    ops.push(addOps);

                    relationId = addOps.relation.id;
                    addOps = await addSources(docket, relationId, client, false);
                    ops.push(...addOps);
                }


                if ((docket.date_filed != null) && (docket.date_filed != "")) {
                    [propertyId, choiceId] = await getPropertyInfo("docket", "Date filed", null, client)
                    addOps = postDate(newGeoId, propertyId, docket.date_filed, null)
                    ops.push(addOps);
                }

                if ((docket.date_terminated != null) && (docket.date_terminated != "")) {
                    [propertyId, choiceId] = await getPropertyInfo("docket", "Date terminated", null, client)
                    addOps = postDate(newGeoId, propertyId, docket.date_terminated, null)
                    ops.push(addOps);
                }

                if ((docket.date_last_filing != null) && (docket.date_last_filing != "")) {
                    [propertyId, choiceId] = await getPropertyInfo("docket", "Date last filing", null, client)
                    addOps = postDate(newGeoId, propertyId, docket.date_last_filing, null)
                    ops.push(addOps);
                }

                if ((docket.date_argued != null) && (docket.date_argued != "")) {
                    [propertyId, choiceId] = await getPropertyInfo("docket", "Date argued", null, client)
                    addOps = postDate(newGeoId, propertyId, docket.date_argued, null)
                    ops.push(addOps);
                }

                if ((docket.date_reargued != null) && (docket.date_reargued != "")) {
                    [propertyId, choiceId] = await getPropertyInfo("docket", "Date re-argued", null, client)
                    addOps = postDate(newGeoId, propertyId, docket.date_reargued, null)
                    ops.push(addOps);
                }
                if ((docket.date_reargument_denied != null) && (docket.date_reargument_denied != "")) {
                    [propertyId, choiceId] = await getPropertyInfo("docket", "Date re-argument denied", null, client)
                    addOps = postDate(newGeoId, propertyId, docket.date_reargument_denied, null)
                    ops.push(addOps);
                }
                if ((docket.date_cert_granted != null) && (docket.date_cert_granted != "")) {
                    [propertyId, choiceId] = await getPropertyInfo("docket", "Date certification granted", null, client)
                    addOps = postDate(newGeoId, propertyId, docket.date_cert_granted, null)
                    ops.push(addOps);
                }
                if ((docket.date_cert_denied != null) && (docket.date_cert_denied != "")) {
                    [propertyId, choiceId] = await getPropertyInfo("docket", "Date certification denied", null, client)
                    addOps = postDate(newGeoId, propertyId, docket.date_cert_denied, null)
                    ops.push(addOps);
                }
                

                if ((docket.cause != null) && (docket.cause != "")) {

                    [propertyId, choiceId] = await getPropertyInfo("docket", "Cause", null, client)
                    addOps = Triple.make({
                		entityId: newGeoId,
                        attributeId: propertyId,
                		value: {
                			type: "TEXT",
                			value: docket.cause,
                		},
                	});
                    ops.push(addOps);
                }

                if ((docket.jury_demand != null) && (docket.jury_demand != "")  && (docket.jury_demand != 0)) {

                    [propertyId, choiceId] = await getPropertyInfo("docket", "Jury demand", null, client)
                    addOps = Triple.make({
                		entityId: newGeoId,
                        attributeId: propertyId,
                		value: {
                			type: "NUMBER",
                			value: docket.jury_demand.toString(),
                		},
                	});
                    ops.push(addOps);
                }

                if ((docket.docket_number != null) && (docket.docket_number != "")) {

                    [propertyId, choiceId] = await getPropertyInfo("docket", "Docket number", null, client)
                    addOps = Triple.make({
                		entityId: newGeoId,
                        attributeId: propertyId,
                		value: {
                			type: "TEXT",
                			value: docket.docket_number.toString(),
                		},
                	});
                    ops.push(addOps);
                } else if ((docket.docket_number_core != null) && (docket.docket_number_core != "")) {
                    [propertyId, choiceId] = await getPropertyInfo("docket", "Docket number", null, client)
                    addOps = Triple.make({
                		entityId: newGeoId,
                        attributeId: propertyId,
                		value: {
                			type: "TEXT",
                			value: docket.docket_number_core.toString(),
                		},
                	});
                    ops.push(addOps);
                }
                
                if (fjc_link) {

                    if ((docket.origin != null) && (docket.origin != "")) {
                        //if not null, relate to respective jurisdiction property
                        [propertyId, choiceId] = await getPropertyInfo("docket", "Origin", docket.origin, client)
                        addOps = Relation.make({
                    		fromId: newGeoId,
                    		toId: choiceId,
                    		relationTypeId: propertyId,
                    	});
                        ops.push(addOps);

                        relationId = addOps.relation.id;
                        addOps = await addSources(docket, relationId, client);
                        ops.push(...addOps);
                    }
                    if ((docket.nature_of_suit != null) && (docket.nature_of_suit != "")) {
                        //if not null, relate to respective jurisdiction property
                        [propertyId, choiceId] = await getPropertyInfo("docket", "Nature of suit", docket.nature_of_suit, client)
                        addOps = Relation.make({
                    		fromId: newGeoId,
                    		toId: choiceId,
                    		relationTypeId: propertyId,
                    	});
                        ops.push(addOps);

                        relationId = addOps.relation.id;
                        addOps = await addSources(docket, relationId, client);
                        ops.push(...addOps);
                    }
                    if ((docket.jurisdiction != null) && (docket.jurisdiction != "")) {
                        //if not null, relate to respective jurisdiction property
                        [propertyId, choiceId] = await getPropertyInfo("docket", "Jurisdiction", docket.jurisdiction, client)
                        addOps = Relation.make({
                    		fromId: newGeoId,
                    		toId: choiceId,
                    		relationTypeId: propertyId,
                    	});
                        ops.push(addOps);

                        relationId = addOps.relation.id;
                        addOps = await addSources(docket, relationId, client);
                        ops.push(...addOps);
                    }
                    if ((docket.monetary_demand != null) && (docket.monetary_demand != "")  && (docket.monetary_demand != 0)) {

                        [propertyId, choiceId] = await getPropertyInfo("docket", "Monetary demand", null, client)
                        if (docket.monetary_demand >= 9999) {
                            addOps = Triple.make({
                        		entityId: newGeoId,
                                attributeId: propertyId,
                        		value: {
                        			type: "TEXT",
                        			value: ">$10M",
                        		},
                        	});
                            ops.push(addOps);
                        } else if (docket.monetary_demand <= 1) {
                            addOps = Triple.make({
                        		entityId: newGeoId,
                                attributeId: propertyId,
                        		value: {
                        			type: "TEXT",
                        			value: "<$500",
                        		},
                        	});
                            ops.push(addOps);
                        } else {
                            addOps = Triple.make({
                        		entityId: newGeoId,
                                attributeId: propertyId,
                        		value: {
                        			type: "NUMBER",
                        			value: (docket.monetary_demand * 1000).toString(),
                                    options: {
                                        unit: '2eGL8drmSYAqLoetcx3yR1',
                                    }
                        		},
                        	});
                            ops.push(addOps);
                        }
                    }
                    if ((docket.arbitration_at_termination != null) && (docket.arbitration_at_termination != "")) {
                        //if not null, relate to respective jurisdiction property
                        [propertyId, choiceId] = await getPropertyInfo("docket", "Arbitration at termination", docket.arbitration_at_termination, client)
                        addOps = Relation.make({
                    		fromId: newGeoId,
                    		toId: choiceId,
                    		relationTypeId: propertyId,
                    	});
                        ops.push(addOps);

                        relationId = addOps.relation.id;
                        addOps = await addSources(docket, relationId, client);
                        ops.push(...addOps);
                    }

                    if ((docket.plaintiff != null) && (docket.plaintiff != "")) {
                        [propertyId, choiceId] = await getPropertyInfo("docket", "Plaintiff", null, client)
                        addOps = Triple.make({
                            entityId: newGeoId,
                            attributeId: propertyId,
                            value: {
                                type: "TEXT",
                                value: docket.plaintiff,
                            },
                        });
                        ops.push(addOps);
                    }
                    if ((docket.defendant != null) && (docket.defendant != "")) {
                        [propertyId, choiceId] = await getPropertyInfo("docket", "Defendant", null, client)
                        addOps = Triple.make({
                            entityId: newGeoId,
                            attributeId: propertyId,
                            value: {
                                type: "TEXT",
                                value: docket.defendant,
                            },
                        });
                        ops.push(addOps);
                    }
                    if ((docket.termination_class_action_status != null) && (docket.termination_class_action_status != "")) {
                        //if not null, relate to respective jurisdiction property
                        [propertyId, choiceId] = await getPropertyInfo("docket", "Class action status at termination", docket.termination_class_action_status, client)
                        addOps = Relation.make({
                    		fromId: newGeoId,
                    		toId: choiceId,
                    		relationTypeId: propertyId,
                    	});
                        ops.push(addOps);

                        relationId = addOps.relation.id;
                        addOps = await addSources(docket, relationId, client);
                        ops.push(...addOps);
                    }
                    if ((docket.procedural_progress != null) && (docket.procedural_progress != "")) {
                        //if not null, relate to respective jurisdiction property
                        [propertyId, choiceId] = await getPropertyInfo("docket", "Procedural progress", docket.procedural_progress, client)
                        addOps = Relation.make({
                    		fromId: newGeoId,
                    		toId: choiceId,
                    		relationTypeId: propertyId,
                    	});
                        ops.push(addOps);

                        relationId = addOps.relation.id;
                        addOps = await addSources(docket, relationId, client);
                        ops.push(...addOps);
                    }
                    if ((docket.disposition != null) && (docket.disposition != "")) {
                        //if not null, relate to respective jurisdiction property
                        [propertyId, choiceId] = await getPropertyInfo("docket", "Disposition", docket.disposition, client)
                        addOps = Relation.make({
                    		fromId: newGeoId,
                    		toId: choiceId,
                    		relationTypeId: propertyId,
                    	});
                        ops.push(addOps);

                        relationId = addOps.relation.id;
                        addOps = await addSources(docket, relationId, client);
                        ops.push(...addOps);
                    }
                    if ((docket.nature_of_judgement != null) && (docket.nature_of_judgement != "")) {
                        //if not null, relate to respective jurisdiction property
                        [propertyId, choiceId] = await getPropertyInfo("docket", "Nature of judgement", docket.nature_of_judgement, client)
                        addOps = Relation.make({
                    		fromId: newGeoId,
                    		toId: choiceId,
                    		relationTypeId: propertyId,
                    	});
                        ops.push(addOps);

                        relationId = addOps.relation.id;
                        addOps = await addSources(docket, relationId, client);
                        ops.push(...addOps);
                    }

                    if ((docket.amount_received != null) && (docket.amount_received != "")  && (docket.amount_received != 0)) {

                        [propertyId, choiceId] = await getPropertyInfo("docket", "Amount received", null, client)
                        addOps = Triple.make({
                            entityId: newGeoId,
                            attributeId: propertyId,
                            value: {
                                type: "NUMBER",
                                value: (docket.amount_received * 1000).toString(),
                                options: {
                                    unit: '2eGL8drmSYAqLoetcx3yR1',
                                }
                            },
                        });
                        ops.push(addOps);
                
                    }
                    if ((docket.judgment != null) && (docket.judgment != "")) {
                        //if not null, relate to respective jurisdiction property
                        [propertyId, choiceId] = await getPropertyInfo("docket", "Judgement favors", docket.judgment, client)
                        addOps = Relation.make({
                    		fromId: newGeoId,
                    		toId: choiceId,
                    		relationTypeId: propertyId,
                    	});
                        ops.push(addOps);

                        relationId = addOps.relation.id;
                        addOps = await addSources(docket, relationId, client);
                        ops.push(...addOps);
                    }
                    if ((docket.pro_se != null) && (docket.pro_se != "")) {
                        //if not null, relate to respective jurisdiction property
                        [propertyId, choiceId] = await getPropertyInfo("docket", "Pro Se", docket.pro_se, client)
                        addOps = Relation.make({
                    		fromId: newGeoId,
                    		toId: choiceId,
                    		relationTypeId: propertyId,
                    	});
                        ops.push(addOps);

                        relationId = addOps.relation.id;
                        addOps = await addSources(docket, relationId, client);
                        ops.push(...addOps);
                    }
                    if ((docket.nature_of_offense != null) && (docket.nature_of_offense != "")) {
                        //if not null, relate to respective jurisdiction property
                        [propertyId, choiceId] = await getPropertyInfo("docket", "Nature of offense", docket.nature_of_offense, client)
                        addOps = Relation.make({
                    		fromId: newGeoId,
                    		toId: choiceId,
                    		relationTypeId: propertyId,
                    	});
                        ops.push(addOps);

                        relationId = addOps.relation.id;
                        addOps = await addSources(docket, relationId, client);
                        ops.push(...addOps);
                    }


                    if ((docket.circuit_id != null) && (docket.circuit_id != "")) {

                        [propertyId, choiceId] = await getPropertyInfo("docket", "Filing circuit", null, client);
                        [addOps, geoId] = await processCourt(docket.circuit_id, client);
                        ops.push(...addOps);
                        
                        if (geoId != null) {
                            addOps = Relation.make({
                                fromId: newGeoId,
                                toId: geoId,
                                relationTypeId: propertyId,
                            });
                            ops.push(addOps);

                            relationId = addOps.relation.id;
                            addOps = await addSources(docket, relationId, client);
                            ops.push(...addOps);
                        }
                    }
                    if ((docket.district_id != null) && (docket.district_id != "")) {

                        [propertyId, choiceId] = await getPropertyInfo("docket", "Filing district", null, client);
                        [addOps, geoId] = await processCourt(docket.district_id, client);
                        ops.push(...addOps);
                        
                        if (geoId != null) {
                            addOps = Relation.make({
                                fromId: newGeoId,
                                toId: geoId,
                                relationTypeId: propertyId,
                            });
                            ops.push(addOps);

                            relationId = addOps.relation.id;
                            addOps = await addSources(docket, relationId, client);
                            ops.push(...addOps);
                        }
                    }
                    
                    if ((docket.transfer_docket_number != null) && (docket.transfer_docket_number != "")) {

                        [propertyId, choiceId] = await getPropertyInfo("docket", "Transferred from", null, client)
                        addOps = Triple.make({
                    		entityId: newGeoId,
                            attributeId: propertyId,
                    		value: {
                    			type: "TEXT",
                    			value: docket.transfer_docket_number.toString(),
                    		},
                    	});
                        ops.push(addOps);
                    }
                }

                
                addOps = await addSources(docket, newGeoId, client);
                ops.push(...addOps);
                

                if (false) {
                    // Once you have the ops you can publish them to IPFS and your space.
                    const txHash = await publish({
                        spaceId,
                        author: walletAddress,
                        editName: `Add docket ${docket.docket_number}`,
                        ops: ops, // An edit accepts an array of Ops
                    });
                    console.log("Your transaction hash is:", txHash);
                }

                //// Update the person with the new geo_id
                await client.query('UPDATE search_docket SET geo_id = $1 WHERE id = $2', [newGeoId, docket.id]);
                await client.query('UPDATE search_docket SET edited = $1 WHERE id = $2', [true, docket.id]);
                console.log(`Updated Docket ID ${docket.id} with geo_id ${newGeoId}`);
                addOps = await processArgument(docket.id, client);
                ops.push(...addOps);

                
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
