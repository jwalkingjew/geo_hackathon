//Lots of good information here: https://github.com/freelawproject/courtlistener/blob/main/cl/people_db/models.py

import { Client } from 'pg';
import { Image, Id, Ipfs, SystemIds, Relation, Triple, Position, TextBlock, DataBlock, Position, PositionRange } from "@graphprotocol/grc-20";
import { deploySpace } from "./deploy-space";
import { publish } from "./publish";
import { processPerson } from "./process_person";
import { processCourt } from "./process_court";
import { processDocket } from "./process_docket";
import { processOpinion } from "./process_opinion";
import { processArgument } from "./process_argument";
import { processCitations } from "./process_citations";
import { format, parse } from 'date-fns';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';



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

async function getOpTypeInfo(
    type: string,
    client
): string {
    
    let res;
    let typeId;
    
    res = await client.query(`
        SELECT * 
        FROM opinion_types
        WHERE key ILIKE $1
    `, [type]);

    if (res.rows.length > 0) {
        return res.rows[0].value;
    } else {
        return null
    }
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

function removeParagraphNumbers(text: string): string {
    
    return text.replace(/^\d+\n/gm, ''); // Removes leading numbers followed by a newline
}

function cleanLegalText(text: string): string {
    
    if ((text != null) && (text != "")) {
        // 1. Remove stray backslashes at the start of lines
        text = text.replace(/\\\s*/g, '');
        
        // 2. Wrap docket numbers in backticks (e.g., "Dkt. No. 3491834918" → "`Dkt. No. 3491834918`")
        text = text.replace(/(Dkt\. No\. \d+)/g, '`$1`');
    
        // 3. Fix escaped brackets (e.g., "\[1997\]" → "[1997]")
        text = text.replace(/\\\[/g, '[').replace(/\\\]/g, ']');
        
        // 4. Remove unnecessary underscores and extra spaces
        text = text.replace(/[_]+/g, ''); // Removes stray underscores
    
        // 2. Italicize case names correctly (avoids accidental formatting issues)
        //text = text.replace(/(\b\w+ v\. [\w\s]+?)(?=, \d|\[|\()/g, '*$1*');
    
        // 4. Ensure proper paragraph breaks (double newlines for Markdown)
        text = text.replace(/\n\s*\n/g, '\n\n');
    
        // 7. Remove asterisks at the start of each paragraph
        text = text.replace(/^\*\s*/gm, ''); // Remove asterisk and whitespace at the beginning of any line
        return text.trim();
    } else {
        return null
    }
}

function cleanLegalTexts(texts: string[]): string[] {
    return texts.map(cleanLegalText); // Apply the cleaning function to each text string
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

async function getJudgeFromName(name, court, date, client): string {
    if ((court != null) && (court != "")) {
        if ((date != null) && (date != "")) {
            const result = await client.query(
                `SELECT p.* 
                 FROM people_db_person p
                 JOIN people_db_position pos ON p.id = pos.person_id
                 WHERE p.name_last ILIKE $1
                 AND pos.court_id = $2
                 AND pos.date_start <= $3
                 AND (pos.date_termination IS NULL OR pos.date_termination >= $3);`,
                [name.trim(), court, date]
            );
            if (result.rows.length === 1) {
                return result.rows[0].id
            } else {
                return null
            }
        } else {
            const result = await client.query(
                `SELECT p.* 
                 FROM people_db_person p
                 JOIN people_db_position pos ON p.id = pos.person_id
                 WHERE p.name_last ILIKE $1
                 AND pos.court_id = $2;`,
                [name.trim(), court, date]
            );
            if (result.rows.length === 1) {
                return result.rows[0].id
            } else {
                return null
            }
        } 
    } else {
        return null
    }
}


async function addDataBlockToOpinionGroup(opinionGroupEntity, client): Array<Op> {
    const ops: Array<Op> = [];    
    let addOps;

    //const testSpaceId = "YRPckind3wVHcowVvbfx5X";
    const usLawSpaceId = "Q5YFEacgaHtXE9Kub9AEkA";
    let propertyId;
    let choiceId;

    //const fromId = "RERshk4JoYoMC17r1qAo9J";
    //const toId = "Qx8dASiTNsxxP3rJbd4Lzd";
    //const relationTypeId = "3WxYoAVreE4qFhkDUs5J3q";
    //const relationPropId = "AKDxovGvZaPSWnmKnSoZJY";

    
    //CREATE THE DATA BLOCK
    let blockOps = DataBlock.make({
        fromId: opinionGroupEntity,
        sourceType: 'QUERY',
        name: "Cited by",
        position: PositionRange.LAST
    });
    ops.push(...blockOps);
    
    
    let blockId = blockOps[2].relation.toEntity
    let blockRelationId = blockOps[2].relation.id

    //SET THE FILTERS FOR THE DATA BLOCK
    
    let opinionTypeId = await getTypeInfo("Opinion Group", client);
    [propertyId, choiceId] = await getPropertyInfo("Opinion Group", "Authorities", null, client)
    let filter = `{"where":{"AND":[{"spaces":["${usLawSpaceId}"],"attribute":"${SystemIds.TYPES_PROPERTY}","is":"${opinionTypeId}"},{"attribute":"${propertyId}","is":"${opinionGroupEntity}"}]}}`
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
    
    return ops;
}

async function addSources(opinionCluster, newGeoId, client, include_scdb: boolean = true): Array<Op> {
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

        if ((opinionCluster.id != null) && (opinionCluster.id != "")){
            [propertyId, choiceId] = await getPropertyInfo("source", "Database identifier", null, client);
            addOps = Triple.make({
                entityId: relationId,
                attributeId: propertyId,
                value: {
                    type: "TEXT",
                    value: opinionCluster.id.toString(),
                },
            });
            ops.push(addOps)

            addOps = Triple.make({
                entityId: relationId,
                attributeId: SystemIds.DESCRIPTION_PROPERTY,
                value: {
                    type: "TEXT",
                    value: "Opinion cluster",
                },
            });
            ops.push(addOps)
            
            if ((opinionCluster.slug != null) && (opinionCluster.slug != "")) {
                addOps = Triple.make({
                    entityId: relationId,
                    attributeId: webURLPropertyId,
                    value: {
                        type: "URL",
                        value: `https://www.courtlistener.com/opinion/${opinionCluster.id.toString()}/${opinionCluster.slug}`,
                    },
                });
                ops.push(addOps)
            }

            if ((opinionCluster.filepath_pdf_harvard != null) && (opinionCluster.filepath_pdf_harvard != "")) {
                addOps = Triple.make({
                    entityId: relationId,
                    attributeId: "BTNv9aAFqAzDjQuf4u2fXK",
                    value: {
                        type: "URL",
                        value: `https://storage.courtlistener.com/${opinionCluster.filepath_pdf_harvard}`,
                    },
                });
                ops.push(addOps)
            }
        }
    }

    if (include_scdb) {
        if ((opinionCluster.scdb_id != null) && (opinionCluster.scdb_id != "")){
            sourceId = await getSourceInfo("The Supreme Court Database", client)
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
                        value: opinionCluster.scdb_id.toString(),
                    },
                });
                ops.push(addOps)
                
                addOps = Triple.make({
                    entityId: relationId,
                    attributeId: webURLPropertyId,
                    value: {
                        type: "URL",
                        value: `http://scdb.wustl.edu/analysisCaseDetail.php?sid=&cid=${opinionCluster.scdb_id}-01&pg=0`,
                    },
                });
                ops.push(addOps)
            }
        
        }
    }

    return ops;
}

// DEFINE NECESSARY CONSTANTS
//const spaceId = "YRPckind3wVHcowVvbfx5X"; // Testnet
const spaceId = "Q5YFEacgaHtXE9Kub9AEkA"; // Mainnet
const walletAddress = "0x0A77FD6b13d135426c25E605a6A4F39AF72fD967";

const defaultOpinionGroupImageId = "WvCXEzUrpcEL1HXKotvQus";

const endTimePropertyId = "R7X9rnVW49g29XvK5KMTtP";
const startTimePropertyId = "6cF7TMDBFwSt5vMENU3Cta";

const worksAtId = "U1uCAzXsRSTP4vFwo1JwJG";
const workedAtId = "8fvqALeBDwEExJsDeTcvnV";

const webURLPropertyId = "93stf6cgYvBsdPruRzq1KK"

export async function processOpinionClusterById(inputId, client): [Array<Op>, string] {
    //FROM THIS FUNCTION, I SEND THE CLUSTER ID to PROCESS OPINION and it processes them all...
    //ONLY LINK THE DOCKET TO THIS ONE THOUGH
    try {
        console.log("BEGIN OPINION CLUSTER")
        const ops: Array<Op> = [];
        let addOps;
        
        const turndownService = new TurndownService();
        let res;

        res = await client.query(`
            SELECT 
                oc.*, d.court_id
            FROM search_opinioncluster as oc
            LEFT JOIN search_docket d ON oc.docket_id = d.id
            WHERE oc.id = $1
        `, [inputId]);

        const opinionClusters = res.rows;
        for (const opinionCluster of opinionClusters) {
            
            console.log(`\n------\nNEWOPINIONGROUP ID: ${opinionCluster.id}\n------\n`);

            let propertyId;
            let choiceId;
            let typeId;
            let relationId;
            let newGeoId: string;
            let addVar;
            let geoId;
            
            if (!opinionCluster.geo_id){
                newGeoId = Id.generate();
                let title = "Opinion Group";
                
                //APPEND FILING DATE ON THIS PREFIX
                if ((opinionCluster.date_filed != null) && (opinionCluster.date_filed != "")) {
                    title =`${title} - ${opinionCluster.date_filed.toISOString().split("T")[0]}`
                }
                if ((opinionCluster.case_name_short != null) && (opinionCluster.case_name_short != "")) {
                    title = `${title} - ${opinionCluster.case_name_short}`
                } else if ((opinionCluster.case_name != null) && (opinionCluster.case_name != "")) {
                    title = `${title} - ${opinionCluster.case_name}`
                } else if ((opinionCluster.slug != null) && (opinionCluster.slug != "")) {
                    title = `${title} - ${opinionCluster.slug}`
                }

                //Create Entity and set the name
                addOps = Triple.make({
                    entityId: newGeoId,
                    attributeId: SystemIds.NAME_PROPERTY,
                    value: {
                        type: "TEXT",
                        value: title,
                    },
                });
                ops.push(addOps);

                addOps = Relation.make({
                    fromId: newGeoId,
                    toId: await getTypeInfo("Opinion Group", client),
                    relationTypeId: SystemIds.TYPES_PROPERTY,
                });
                ops.push(addOps);

                if (defaultOpinionGroupImageId!= "") {
                    addOps = Relation.make({
                        fromId: newGeoId,
                        toId: defaultOpinionGroupImageId,
                        relationTypeId: "7YHk6qYkNDaAtNb8GwmysF", //COVER PROPERTY
                    });
                    ops.push(addOps);
                }

                //CASE NAME
                addVar = null
                if ((opinionCluster.case_name_full != null) && (opinionCluster.case_name_full != "")) {
                    addVar = opinionCluster.case_name_full
                } else if ((opinionCluster.case_name != null) && (opinionCluster.case_name != "")) {
                    addVar = opinionCluster.case_name
                } else {
                    addVar = opinionCluster.case_name_short
                }
                if ((addVar != null) && (addVar != "")) {
                    [propertyId, choiceId] = await getPropertyInfo("Opinion Group", "Case name", null, client)
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
                }

                if ((opinionCluster.date_filed != null) && (opinionCluster.date_filed != "")) {
                    [propertyId, choiceId] = await getPropertyInfo("Opinion Group", "Date filed", null, client)
                    addOps = postDate(newGeoId, propertyId, opinionCluster.date_filed, null)
                    ops.push(addOps);
                }
                if ((opinionCluster.court_id != null) && (opinionCluster.court_id != "")) {

                    [propertyId, choiceId] = await getPropertyInfo("Opinion Group", "Assigned court", null, client);
                    [addOps, geoId] = await processCourt(opinionCluster.court_id, client);
                    ops.push(...addOps);
                    
                    if (geoId != null) {
                        addOps = Relation.make({
                            fromId: newGeoId,
                            toId: geoId,
                            relationTypeId: propertyId,
                        });
                        ops.push(addOps);

                        relationId = addOps.relation.id;
                        addOps = await addSources(opinionCluster, relationId, client);
                        ops.push(...addOps);
                    }
                }
                
                const textBlockOps: Array<string> = [];
                //HEADNOTES FIRST
                if ((opinionCluster.headnotes != null) && (opinionCluster.headnotes != "")) {
                    let output_push = (turndownService.turndown(opinionCluster.headnotes).split(/ {3,}|\r?\n|\f+/)).filter(str => str.trim() != "").map(str => str.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"));
                    output_push = cleanLegalTexts(output_push);
                                                  
                    if (output_push != null) {
                        textBlockOps.push("# Headnotes");
                        textBlockOps.push(...output_push);
                    }
                } else if ((opinionCluster.headmatter != null) && (opinionCluster.headmatter != "")) {
                    
                    let output_push = (turndownService.turndown(opinionCluster.headmatter).split(/ {3,}|\r?\n|\f+/)).filter(str => str.trim() != "").map(str => str.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"));
                    output_push = cleanLegalTexts(output_push);
                                                  
                    if (output_push != null) {
                        textBlockOps.push("# Headnotes");
                        textBlockOps.push(...output_push);
                    }
                }
                //SYLLABUS
                if ((opinionCluster.syllabus != null) && (opinionCluster.syllabus != "")) {
                    let output_push = (turndownService.turndown(opinionCluster.syllabus).split(/ {3,}|\r?\n|\f+/)).filter(str => str.trim() != "").map(str => str.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"));
                    output_push = cleanLegalTexts(output_push);
                                                  
                    if (output_push != null) {
                        textBlockOps.push("# Syllabus");
                        textBlockOps.push(...output_push);
                    }
                }
                
                //SUMMMARY
                if ((opinionCluster.summary != null) && (opinionCluster.summary != "")) {
                    let output_push = (turndownService.turndown(opinionCluster.summary).split(/ {3,}|\r?\n|\f+/)).filter(str => str.trim() != "").map(str => str.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"));
                    output_push = cleanLegalTexts(output_push);
                                                  
                    if (output_push != null) {
                        textBlockOps.push("# Summary");
                        textBlockOps.push(...output_push);
                    }
                }
                
                //Procedural history
                if ((opinionCluster.procedural_history != null) && (opinionCluster.procedural_history != "")) {
                    let output_push = (turndownService.turndown(opinionCluster.procedural_history).split(/ {3,}|\r?\n|\f+/)).filter(str => str.trim() != "").map(str => str.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"));
                    output_push = cleanLegalTexts(output_push);
                                                  
                    if (output_push != null) {
                        textBlockOps.push("# Procedural History");
                        textBlockOps.push(...output_push);
                    }
                    
                }
                //History
                if ((opinionCluster.history != null) && (opinionCluster.history != "")) {
                    let output_push = (turndownService.turndown(opinionCluster.history).split(/ {3,}|\r?\n|\f+/)).filter(str => str.trim() != "").map(str => str.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"));
                    output_push = cleanLegalTexts(output_push);
                                                  
                    if (output_push != null) {
                        textBlockOps.push("# History");
                        textBlockOps.push(...output_push);
                    }

                }
                //Attorneys
                if ((opinionCluster.attorneys != null) && (opinionCluster.attorneys != "")) {
                    let output_push = (turndownService.turndown(opinionCluster.attorneys).split(/ {3,}|\r?\n|\f+/)).filter(str => str.trim() != "").map(str => str.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"));
                    output_push = cleanLegalTexts(output_push);
                                                  
                    if (output_push != null) {
                        textBlockOps.push("# Attorneys");
                        textBlockOps.push(...output_push);
                    }
                    
                }
                //Arguments
                if ((opinionCluster.arguments != null) && (opinionCluster.arguments != "")) {
                    let output_push = (turndownService.turndown(opinionCluster.arguments).split(/ {3,}|\r?\n|\f+/)).filter(str => str.trim() != "").map(str => str.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"));
                    output_push = cleanLegalTexts(output_push);
                                                  
                    if (output_push != null) {
                        textBlockOps.push("# Arguments");
                        textBlockOps.push(...output_push);
                    }
                }
                //Correction
                if ((opinionCluster.correction != null) && (opinionCluster.correction != "")) {
                    let output_push = (turndownService.turndown(opinionCluster.correction).split(/ {3,}|\r?\n|\f+/)).filter(str => str.trim() != "").map(str => str.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"));
                    output_push = cleanLegalTexts(output_push);
                                                  
                    if (output_push != null) {
                        textBlockOps.push("# Correction");
                        textBlockOps.push(...output_push);
                    }
                }
                //Other Dates
                if ((opinionCluster.other_dates != null) && (opinionCluster.other_dates != "")) {
                    let output_push = (turndownService.turndown(opinionCluster.other_dates).split(/ {3,}|\r?\n|\f+/)).filter(str => str.trim() != "").map(str => str.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"));
                    output_push = cleanLegalTexts(output_push);
                                                  
                    if (output_push != null) {
                        textBlockOps.push("# Other Dates");
                        textBlockOps.push(...output_push);
                    }
                }
                if (textBlockOps.length > 0) {
                    addOps = createContent(newGeoId, textBlockOps);
                    ops.push(...addOps)
                }

               
                

                
                addOps = await addDataBlockToOpinionGroup(newGeoId, client)
                ops.push(...addOps)

                

            
                
                if ((opinionCluster.judges != null) && (opinionCluster.judges != "")) {
                    [propertyId, choiceId] = await getPropertyInfo("Opinion Group", "Judges", null, client)
                    let judgeId;
                    let judgeArr;
                    judgeArr = opinionCluster.judges.split(/[\s,]+/);
                    for (const judge of judgeArr) {
                        judgeId = await getJudgeFromName(judge, opinionCluster.court_id, opinionCluster.date_filed, client)
                        if (judgeId != null) {
                            [addOps, geoId] = await processPerson(judgeId, client);
                            ops.push(...addOps);
                            if (geoId != null) {
                                addOps = Relation.make({
                                    fromId: newGeoId,
                                    toId: geoId,
                                    relationTypeId: propertyId,
                                });
                                ops.push(addOps);

                                relationId = addOps.relation.id;
                                addOps = await addSources(opinionCluster, relationId, client, false);
                                ops.push(...addOps);
                            }
                        }
                    }
                }
                
                

                if ((opinionCluster.disposition != null) && (opinionCluster.disposition != "")) {
                    [propertyId, choiceId] = await getPropertyInfo("Opinion Group", "Disposition", null, client)
                    addOps = Triple.make({
                        entityId: newGeoId,
                        attributeId: propertyId,
                        value: {
                            type: "TEXT",
                            value: opinionCluster.disposition,
                        },
                    });
                    ops.push(addOps);
                }

                if ((opinionCluster.docket_id != null) && (opinionCluster.docket_id != "")) {
                    [addOps, geoId] = await processDocket(opinionCluster.docket_id, client);
                    ops.push(...addOps);
                    
                    [propertyId, choiceId] = await getPropertyInfo("Opinion Group", "Docket", null, client)
                    if (geoId != null) {
                        addOps = Relation.make({
                            fromId: newGeoId,
                            toId: geoId,
                            relationTypeId: propertyId,
                        });
                        ops.push(addOps);
                        relationId = addOps.relation.id;
                        addOps = await addSources(opinionCluster, relationId, client);
                        ops.push(...addOps);
                    }
                    
                    [propertyId, choiceId] = await getPropertyInfo("docket", "Opinions", null, client)
                    if (geoId != null) {
                        addOps = Relation.make({
                            fromId: geoId,
                            toId: newGeoId,
                            relationTypeId: propertyId,
                        });
                        ops.push(addOps);
                        relationId = addOps.relation.id;
                        addOps = await addSources(opinionCluster, relationId, client);
                        ops.push(...addOps);
                    }
                }
                
                
                if ((opinionCluster.scdb_decision_direction != null) && (opinionCluster.scdb_decision_direction != "")) {

                    [propertyId, choiceId] = await getPropertyInfo("Opinion Group", "Decision leaning", opinionCluster.scdb_decision_direction, client)
                    if (choiceId != null) {
                        addOps = Relation.make({
                            fromId: newGeoId,
                            toId: choiceId,
                            relationTypeId: propertyId,
                        });
                        ops.push(addOps);

                        relationId = addOps.relation.id;
                        addOps = await addSources(opinionCluster, relationId, client);
                        ops.push(...addOps);
                    }
                }

                if ((opinionCluster.scdb_votes_majority != null) && (opinionCluster.scdb_votes_majority != "")) {

                    [propertyId, choiceId] = await getPropertyInfo("Opinion Group", "Majority votes", null, client)
                    addOps = Triple.make({
                        entityId: newGeoId,
                        attributeId: propertyId,
                        value: {
                            type: "NUMBER",
                            value: opinionCluster.scdb_votes_majority.toString(),
                        },
                    });
                    ops.push(addOps);
                }
                
                if ((opinionCluster.scdb_votes_minority != null) && (opinionCluster.scdb_votes_minority != "")) {

                    [propertyId, choiceId] = await getPropertyInfo("Opinion Group", "Minority votes", null, client)
                    addOps = Triple.make({
                        entityId: newGeoId,
                        attributeId: propertyId,
                        value: {
                            type: "NUMBER",
                            value: opinionCluster.scdb_votes_minority.toString(),
                        },
                    });
                    ops.push(addOps);
                }


                if ((opinionCluster.posture != null) && (opinionCluster.posture != "")) {

                    [propertyId, choiceId] = await getPropertyInfo("Opinion Group", "Posture", null, client)
                    addOps = Triple.make({
                        entityId: newGeoId,
                        attributeId: propertyId,
                        value: {
                            type: "TEXT",
                            value: opinionCluster.posture,
                        },
                    });
                    ops.push(addOps);
                }

                

                if ((opinionCluster.citation_count != null) && (opinionCluster.citation_count != "") && (opinionCluster.citation_count != 0)) {

                    [propertyId, choiceId] = await getPropertyInfo("Opinion Group", "Citation count", null, client)
                    addOps = Triple.make({
                        entityId: newGeoId,
                        attributeId: propertyId,
                        value: {
                            type: "NUMBER",
                            value: opinionCluster.citation_count.toString(),
                        },
                    });
                    ops.push(addOps);
                }

                if ((opinionCluster.precedential_status != null) && (opinionCluster.precedential_status != "")) {

                    [propertyId, choiceId] = await getPropertyInfo("Opinion Group", "Precedential status", opinionCluster.precedential_status, client)
                    if (choiceId != null) {
                        addOps = Relation.make({
                            fromId: newGeoId,
                            toId: choiceId,
                            relationTypeId: propertyId,
                        });
                        ops.push(addOps);
                        
                        relationId = addOps.relation.id;
                        addOps = await addSources(opinionCluster, relationId, client, false);
                        ops.push(...addOps);
                    }
                }

                addOps = await addSources(opinionCluster, newGeoId, client);
                ops.push(...addOps);
                
                if (false) {
                    // Once you have the ops you can publish them to IPFS and your space.
                    const txHash = await publish({
                        spaceId,
                        author: walletAddress,
                        editName: `Add Opinion group ${opinionCluster.id}`,
                        ops: ops, // An edit accepts an array of Ops
                    });
                    console.log("Your transaction hash is:", txHash);
                }
                //// Update the person with the new geo_id
                await client.query('UPDATE search_opinioncluster SET geo_id = $1 WHERE id = $2', [newGeoId, opinionCluster.id]);
                await client.query('UPDATE search_opinioncluster SET edited = $1 WHERE id = $2', [true, opinionCluster.id]);
                console.log(`Updated Opinion group ID ${opinionCluster.id} with geo_id ${newGeoId}`);
                addOps = await processOpinion(opinionCluster.id, client);
                ops.push(...addOps);
                
                
                return [ops, newGeoId];
            } else {
                addOps = await processOpinion(opinionCluster.id, client)
                ops.push(...addOps);

                
                return [ops, opinionCluster.geo_id];
            } 
        }
    } catch (err) {
        console.error('Error updating opinion group:', err);
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
