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

function cleanHtml(html: string): string {
    const $ = cheerio.load(html);

    // Remove script and style tags
    $('script, style').remove();

    // Extract and normalize text content
    return $('body').text().replace(/\s+/g, ' ').trim();
}

function removeParagraphNumbers(text: string): string {
    return text.replace(/^\d+\n/gm, ''); // Removes leading numbers followed by a newline
}

function cleanLegalText(text: string): string {

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

async function getJudgeFromName(name, court, date, client) {
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
            if (result.rows.length == 1) {
                return result.rows[0].id
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
            if (result.rows.length == 1) {
                return result.rows[0].id
            }   
        }
    } else {
        return null
    }
}

async function getNameFromJudge(person_id, client) {
    if ((person_id != null) && (person_id != "")) {
        
        const result = await client.query(
            `SELECT p.* 
             FROM people_db_person p
             WHERE p.geo_id = $1 ;`,
            [person_id]
        );
        if (result.rows.length == 1) {
            return result.rows[0].name_last
        } else {
            return null
        }
        
    } else {
        return null
    }
}

async function addSources(opinion, newGeoId, client, include_scdb: boolean = true): Array<Op> {
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

        if (opinion.id != null) {
            [propertyId, choiceId] = await getPropertyInfo("source", "Database identifier", null, client);
            addOps = Triple.make({
                entityId: relationId,
                attributeId: propertyId,
                value: {
                    type: "TEXT",
                    value: opinion.id.toString(),
                },
            });
            ops.push(addOps)

            addOps = Triple.make({
                entityId: relationId,
                attributeId: SystemIds.DESCRIPTION_PROPERTY,
                value: {
                    type: "TEXT",
                    value: "Opinion",
                },
            });
            ops.push(addOps)
            
            if ((opinion.slug != null) && (opinion.slug != "")) {
                addOps = Triple.make({
                    entityId: relationId,
                    attributeId: webURLPropertyId,
                    value: {
                        type: "URL",
                        value: `https://www.courtlistener.com/opinion/${opinion.cluster_id.toString()}/${opinion.slug}`,
                    },
                });
                ops.push(addOps)
            }
        }
    }

    if (include_scdb) {
        if ((opinion.scdb_id != null) && (opinion.scdb_id != "")) {
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
                        value: opinion.scdb_id.toString(),
                    },
                });
                ops.push(addOps)  
    
                addOps = Triple.make({
                    entityId: relationId,
                    attributeId: webURLPropertyId,
                    value: {
                        type: "URL",
                        value: `http://scdb.wustl.edu/analysisCaseDetail.php?sid=&cid=${opinion.scdb_id}-01&pg=0`,
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

const defaultOpinionImageId = "LkvXiYi1cbtGa2zKMgdnMF";

const endTimePropertyId = "R7X9rnVW49g29XvK5KMTtP";
const startTimePropertyId = "6cF7TMDBFwSt5vMENU3Cta";

const worksAtId = "U1uCAzXsRSTP4vFwo1JwJG";
const workedAtId = "8fvqALeBDwEExJsDeTcvnV";

const webURLPropertyId = "93stf6cgYvBsdPruRzq1KK"
const databaseIdPropertyId = "2XaDUAbys7eBAMR168vw9L"

export async function processOpinion(inputId, client): Array<Op> {
    try {
        console.log("BEGIN OPINION")
        const ops: Array<Op> = [];
        let addOps;
        
        let res;

        res = await client.query(`
            SELECT 
                o.id, o.type, o.sha1, o.download_url, o.local_path, o.plain_text, o.author_str, o.joined_by_str,
                o.html, o.html_lawbox, o.html_columbia, o.html_with_citations, o.xml_harvard, o.html_anon_2020,
                o.author_id, o.cluster_id, o.per_curiam, o.page_count, o.geo_id,
                oc.slug, oc.case_name_short, oc.case_name, oc.case_name_full, oc.scdb_id, oc.source, oc.procedural_history, 
                oc.attorneys, oc.nature_of_suit, oc.posture, oc.syllabus, oc.citation_count, oc.precedential_status, 
                oc.date_blocked, oc.blocked, oc.docket_id, oc.scdb_decision_direction, oc.scdb_votes_majority, 
                oc.scdb_votes_minority, oc.date_filed_is_approximate, oc.correction, oc.cross_reference, oc.disposition, 
                oc.filepath_json_harvard, oc.headnotes, oc.history, oc.other_dates, oc.summary, oc.arguments, 
                oc.headmatter, oc.filepath_pdf_harvard, oc.date_filed,
                d.court_id, oc.geo_id as cluster_geo_id
            FROM search_opinion as o
            LEFT JOIN search_opinioncluster oc ON oc.id = o.cluster_id
            LEFT JOIN search_docket d ON oc.docket_id = d.id
            WHERE o.cluster_id = $1
        `, [inputId]);
        
        const opinions = res.rows;
        for (const opinion of opinions) {
            
            console.log(`\n------\nNEWOPINION\n------\n`);

            let propertyId;
            let choiceId;
            let typeId;
            let relationId;
            let newGeoId: string;
            let addVar;
            let geoId;
            
            if (!opinion.geo_id){
                newGeoId = Id.generate();
                let opinionType;
                let prefix = "";

                
                opinionType = await getOpTypeInfo(opinion.type, client)
                
                if (opinionType != null) {
                    prefix = `${opinionType}`
                } else {
                    prefix = "Opinion"
                }
                
                addVar = "";
                if ((opinion.case_name_full != null) && (opinion.case_name_full != "")) {
                    addVar = `${opinion.case_name_full}`
                    
                } else if ((opinion.case_name != null) && (opinion.case_name != "")) {
                    addVar = `${opinion.case_name}`
                    
                } else {
                    addVar = `${opinion.case_name_short}`
                }
                
                if (addVar != null) {
                    [propertyId, choiceId] = await getPropertyInfo("opinion", "Case name", null, client)
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

                //SET TEXT BLOCK

                
                let markdownText;
                const turndownService = new TurndownService();
                //turndownService.addRule('inlinePre', {
                //  filter: (node) => node.nodeName === 'PRE' && node.classList.contains('inline'),
                //  replacement(content: string) {
                //    // Remove excess newlines and spaces inside the inline <pre>
                //    return content.replace(/\n+/g, ' ').trim();
                //  }
                //});
                function countLargeSpaceSequences(str: string): number {
                  const matches = str.match(/ {10,}/g); // Find sequences of 10 or more spaces
                  return matches ? matches.length : 0; // Return count or 0 if no match
                }
                 if (((opinion.html_with_citations != null) && (opinion.html_with_citations != "")) 
&& ((countLargeSpaceSequences(opinion.html_with_citations) < 7) || (opinion.plain_text == ""))) {
                    markdownText = removeParagraphNumbers(turndownService.turndown(opinion.html_with_citations))
                    markdownText =  markdownText.split(/ {7,}|\r?\n|\f+/).map(str => str.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"));
                    markdownText = cleanLegalTexts(markdownText)
                    markdownText = markdownText.filter(str => str.trim() != "");
                    addOps = createContent(newGeoId, markdownText)
                    if (addOps != null) {
                        ops.push(...addOps)
                    }
                } else if (((opinion.html != null) && (opinion.html != "")) && ((countLargeSpaceSequences(opinion.html) < 7) || (opinion.plain_text == ""))) {
                    markdownText = removeParagraphNumbers(turndownService.turndown(opinion.html))
                    markdownText =  markdownText.split(/ {7,}|\r?\n|\f+/).map(str => str.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"));
                    markdownText = cleanLegalTexts(markdownText)
                    markdownText = markdownText.filter(str => str.trim() != "");
                    addOps = createContent(newGeoId, markdownText)
                    if (addOps != null) {
                        ops.push(...addOps)
                    }
                } else if (((opinion.html_lawbox != null) && (opinion.html_lawbox != "")) && ((countLargeSpaceSequences(opinion.html_lawbox) < 7) || (opinion.plain_text == ""))) {
                    markdownText = removeParagraphNumbers(turndownService.turndown(opinion.html_lawbox))
                    markdownText =  markdownText.split(/ {7,}|\r?\n|\f+/).map(str => str.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"));
                    markdownText = cleanLegalTexts(markdownText)
                    markdownText = markdownText.filter(str => str.trim() != "");
                    addOps = createContent(newGeoId, markdownText)
                    if (addOps != null) {
                        ops.push(...addOps)
                    }
                } else if (((opinion.html_anon_2020 != null) && (opinion.html_anon_2020 != "")) && ((countLargeSpaceSequences(opinion.html_anon_2020) < 7) || (opinion.plain_text == ""))) {
                    markdownText = removeParagraphNumbers(turndownService.turndown(opinion.html_anon_2020));
                    markdownText =  markdownText.split(/ {7,}|\r?\n|\f+/).map(str => str.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"));
                    markdownText = cleanLegalTexts(markdownText);
                    markdownText = markdownText.filter(str => str.trim() != "");
                    addOps = createContent(newGeoId, markdownText);
                    if (addOps != null) {
                        ops.push(...addOps)
                    }
                } else if (((opinion.xml_harvard != null) && (opinion.xml_harvard != "")) && ((countLargeSpaceSequences(opinion.xml_harvard) < 7) || (opinion.plain_text == ""))) {
                    markdownText = removeParagraphNumbers(turndownService.turndown(opinion.xml_harvard))
                    markdownText =  markdownText.split(/ {7,}|\r?\n|\f+/).map(str => str.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"));
                    markdownText = cleanLegalTexts(markdownText)
                    markdownText = markdownText.filter(str => str.trim() != "");
                    addOps = createContent(newGeoId, markdownText)
                    if (addOps != null) {
                        ops.push(...addOps)
                    }
                } else if (((opinion.html_columbia != null) && (opinion.html_columbia != "")) && ((countLargeSpaceSequences(opinion.xml_harvard) < 7) || (opinion.plain_text == ""))) {
                    markdownText = removeParagraphNumbers(turndownService.turndown(opinion.html_columbia))
                    markdownText =  markdownText.split(/ {7,}|\r?\n|\f+/).map(str => str.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"));
                    markdownText = cleanLegalTexts(markdownText)
                    markdownText = markdownText.filter(str => str.trim() != "");
                    addOps = createContent(newGeoId, markdownText)
                    if (addOps != null) {
                        ops.push(...addOps)
                    }
                } else if ((opinion.plain_text != null) && (opinion.plain_text != "")) {
                    markdownText = removeParagraphNumbers(opinion.plain_text)
                    markdownText =  markdownText.split(/ {30,}|\r?\n|\f+/).map(str => str.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"));
                    markdownText = cleanLegalTexts(markdownText)
                    markdownText = markdownText.filter(str => str.trim() != "");
                    addOps = createContent(newGeoId, markdownText)
                    if (addOps != null) {
                        ops.push(...addOps)
                    }
                }

                
                if ((opinion.date_filed != null) && (opinion.date_filed != "")) {
                    [propertyId, choiceId] = await getPropertyInfo("opinion", "Date filed", null, client)
                    addOps = postDate(newGeoId, propertyId, opinion.date_filed, null)
                    ops.push(addOps);
                }
                if ((opinion.court_id != null) && (opinion.court_id != "")) {

                    [propertyId, choiceId] = await getPropertyInfo("opinion", "Assigned court", null, client);
                    [addOps, geoId] = await processCourt(opinion.court_id, client);
                    ops.push(...addOps);
                    
                    if (geoId != null) {
                        addOps = Relation.make({
                            fromId: newGeoId,
                            toId: geoId,
                            relationTypeId: propertyId,
                        });
                        ops.push(addOps);

                        relationId = addOps.relation.id;
                        addOps = await addSources(opinion, relationId, client, false);
                        ops.push(...addOps);
                    }
                }
                
                let judgeLastName;
                if ((opinion.author_id != null) && (opinion.author_id != "")) {
                    [addOps, geoId] = await processPerson(opinion.author_id, client);
                    ops.push(...addOps);
                    
                    //ADD AUTHOR TO OPINION
                    [propertyId, choiceId] = await getPropertyInfo("opinion", "Authors", null, client)
                    if (geoId != null) {
                        judgeLastName = await getNameFromJudge(geoId, client)
                        addOps = Relation.make({
                            fromId: newGeoId,
                            toId: geoId,
                            relationTypeId: propertyId,
                        });
                        ops.push(addOps);

                        relationId = addOps.relation.id;
                        addOps = await addSources(opinion, relationId, client, false);
                        ops.push(...addOps);
                    } 
                } else if ((opinion.author_str != null) && (opinion.author_str != "")) {
                    [propertyId, choiceId] = await getPropertyInfo("opinion", "Authors", null, client)
                    let judgeId;
                    let judgeArr;
                    judgeArr = opinion.author_str.split(/[\s,]+/);;
                    for (const judge of judgeArr) {
                        if ((judge.trim() != null) && (judge.trim() != "")) {
                            judgeId = await getJudgeFromName(judge.trim(), opinion.court_id, opinion.date_filed, client)
                            if (judgeId != null) {
                                [addOps, geoId] = await processPerson(judgeId, client);
                                ops.push(...addOps);
                                if (geoId != null) {
                                    judgeLastName = await getNameFromJudge(geoId, client)
                                    addOps = Relation.make({
                                        fromId: newGeoId,
                                        toId: geoId,
                                        relationTypeId: propertyId,
                                    });
                                    ops.push(addOps);

                                    relationId = addOps.relation.id;
                                    addOps = await addSources(opinion, relationId, client, false);
                                    ops.push(...addOps);
                                }
                            }
                        }
                    }
                }
               
                //SET ENTITY NAME
                addVar = "";
                if ((judgeLastName != null) && (judgeLastName != "")) {
                    addVar = ` - ${judgeLastName}`
                    
                }
                

                if ((opinion.case_name_short != null) && (opinion.case_name_short != "")) {
                    addVar = `${addVar} - ${opinion.case_name_short}`
                    
                } else if ((opinion.case_name != null) && (opinion.case_name != "")) {
                    addVar = `${addVar} - ${opinion.case_name}`
                    
                } else {
                    addVar = `${addVar} - ${opinion.case_name_full}`
                    
                }

                
                //Create Entity and set the name
                addOps = Triple.make({
                    entityId: newGeoId,
                    attributeId: SystemIds.NAME_PROPERTY,
                    value: {
                        type: "TEXT",
                        value: `${prefix}${addVar}`,
                    },
                });
                ops.push(addOps);

                addOps = Relation.make({
                    fromId: newGeoId,
                    toId: await getTypeInfo("Opinion", client),
                    relationTypeId: SystemIds.TYPES_PROPERTY,
                });
                ops.push(addOps);

                if (defaultOpinionImageId!= "") {
                    addOps = Relation.make({
                        fromId: newGeoId,
                        toId: defaultOpinionImageId,
                        relationTypeId: "7YHk6qYkNDaAtNb8GwmysF", //COVER PROPERTY
                    });
                    ops.push(addOps);
                }
                
                
                let joinsFound = false;
                //SEARCH FOR Joined by
                let joinRes;
                let joinJudges;
                joinRes = await client.query(`
                    SELECT 
                        *
                    FROM search_opinion_joined_by
                    WHERE opinion_id = $1
                `, [opinion.id]);
                joinJudges = joinRes.rows
                if (joinJudges.length > 0) {
                    for (const joinJudge of joinJudges) {
                        if (joinJudge.person_id != opinion.author_id){
                            [addOps, geoId] = await processPerson(joinJudge.person_id, client);
                            ops.push(...addOps);
                            //ADD AUTHOR TO OPINION
                            [propertyId, choiceId] = await getPropertyInfo("opinion", "Joined by", null, client)
                            if (geoId != null) {
                                joinsFound = true;
                                addOps = Relation.make({
                                    fromId: newGeoId,
                                    toId: geoId,
                                    relationTypeId: propertyId,
                                });
                                ops.push(addOps);   
                                
                                relationId = addOps.relation.id;
                                addOps = await addSources(opinion, relationId, client, false);
                                ops.push(...addOps);
                            }
                        }
                    }
                }

                if (joinsFound == false) {
                    [propertyId, choiceId] = await getPropertyInfo("opinion", "Joined by", null, client)
                    let judgeId;
                    let judgeArr;
                    judgeArr = opinion.joined_by_str.split(",");
                    for (const judge of judgeArr) {
                        if ((judge.trim() != null) && (judge.trim() != "")) {
                            judgeId = await getJudgeFromName(judge, opinion.court_id, opinion.date_filed, client)
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
                                    addOps = await addSources(opinion, relationId, client, false);
                                    ops.push(...addOps);
                                }
                            }
                        }
                    }
                }
                
                
                //SEARCH FOR PANEL JUDGES
                let panelRes;
                let panelJudges;
                panelRes = await client.query(`
                    SELECT 
                        *
                    FROM search_opinioncluster_panel
                    WHERE opinioncluster_id = $1
                `, [opinion.cluster_id]);
                panelJudges = panelRes.rows
                if (panelJudges.length > 0) {
                    for (const judge of panelJudges) {
                        if (judge.person_id != opinion.author_id){
                            [addOps, geoId] = await processPerson(judge.person_id, client);
                            ops.push(...addOps);
                            //ADD AUTHOR TO OPINION
                            [propertyId, choiceId] = await getPropertyInfo("opinion", "Panel Judges", null, client)
                            if (geoId != null) {
                                addOps = Relation.make({
                                    fromId: newGeoId,
                                    toId: geoId,
                                    relationTypeId: propertyId,
                                });
                                ops.push(addOps);

                                relationId = addOps.relation.id;
                                addOps = await addSources(opinion, relationId, client, false);
                                ops.push(...addOps);
                            }
                        }
                    }
                }
                if ((opinion.cluster_geo_id != null) && (opinion.cluster_geo_id != "")) {
                    
                    [propertyId, choiceId] = await getPropertyInfo("Opinion Group", "Opinions", null, client)
                    
                    addOps = Relation.make({
                        fromId: opinion.cluster_geo_id,
                        toId: newGeoId,
                        relationTypeId: propertyId,
                    });
                    ops.push(addOps);

                    relationId = addOps.relation.id;
                    addOps = await addSources(opinion, relationId, client, false);
                    ops.push(...addOps);
                    
                    
                    [propertyId, choiceId] = await getPropertyInfo("opinion", "Opinion group", null, client)
                    
                    addOps = Relation.make({
                        fromId: newGeoId,
                        toId: opinion.cluster_geo_id,
                        relationTypeId: propertyId,
                    });
                    ops.push(addOps);

                    relationId = addOps.relation.id;
                    addOps = await addSources(opinion, relationId, client, false);
                    ops.push(...addOps);
                
                }

                if ((opinion.type != null) && (opinion.type != "")) {

                    [propertyId, choiceId] = await getPropertyInfo("opinion", "Opinion type", opinion.type, client)
                    if (choiceId != null) {
                        addOps = Relation.make({
                            fromId: newGeoId,
                            toId: choiceId,
                            relationTypeId: propertyId,
                        });
                        ops.push(addOps);
                    }

                    relationId = addOps.relation.id;
                    addOps = await addSources(opinion, relationId, client, false);
                    ops.push(...addOps);
                }
                
                if ((opinion.download_url != null) && (opinion.download_url != "")) {

                    [propertyId, choiceId] = await getPropertyInfo("opinion", "Download URL", null, client)
                    addOps = Triple.make({
                        entityId: newGeoId,
                        attributeId: propertyId,
                        value: {
                            type: "URL",
                            value: opinion.download_url,
                        },
                    });
                    ops.push(addOps);
                }

                if ((opinion.per_curiam != null)) {
                    [propertyId, choiceId] = await getPropertyInfo("opinion", "Per curiam", null, client)
                    let check_val;
                    if (opinion.per_curiam) {
                        check_val = "1";
                    } else {
                        check_val = "0";
                    }
                    addOps = Triple.make({
                        entityId: newGeoId,
                        attributeId: propertyId,
                        value: {
                            type: "CHECKBOX",
                            value: check_val,
                        },
                    });
                    ops.push(addOps);
                }
                

                addOps = await addSources(opinion, newGeoId, client, false);
                ops.push(...addOps);
                

                if (false){
                    // Once you have the ops you can publish them to IPFS and your space.
                    const txHash = await publish({
                        spaceId,
                        author: walletAddress,
                        editName: `Add Opinion ${opinion.id}`,
                        ops: ops, // An edit accepts an array of Ops
                    });
                    console.log("Your transaction hash is:", txHash);
                    
                    
                }
                //// Update the person with the new geo_id
                await client.query('UPDATE search_opinion SET geo_id = $1 WHERE id = $2', [newGeoId, opinion.id]);
                await client.query('UPDATE search_opinion SET edited = $1 WHERE id = $2', [true, opinion.id]);
                console.log(`Updated Opinion ID ${opinion.id} with geo_id ${newGeoId}`);

            }
        }

        return ops;
    } catch (err) {
        console.error('Error updating opinion:', err);
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
