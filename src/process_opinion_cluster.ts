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
import { processOpinionClusterById } from "./process_opinion_cluster_by_cluster_id";
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



// DEFINE NECESSARY CONSTANTS
//const spaceId = "YRPckind3wVHcowVvbfx5X"; // Testnet
const spaceId = "Q5YFEacgaHtXE9Kub9AEkA"; // Mainnet
const walletAddress = "0x0A77FD6b13d135426c25E605a6A4F39AF72fD967";

const endTimePropertyId = "R7X9rnVW49g29XvK5KMTtP";
const startTimePropertyId = "6cF7TMDBFwSt5vMENU3Cta";

const worksAtId = "U1uCAzXsRSTP4vFwo1JwJG";
const workedAtId = "8fvqALeBDwEExJsDeTcvnV";

const webURLPropertyId = "93stf6cgYvBsdPruRzq1KK"

export async function processOpinionCluster(inputId, client): Array<Op> {
    //FROM THIS FUNCTION, I SEND THE CLUSTER ID to PROCESS OPINION and it processes them all...
    //ONLY LINK THE DOCKET TO THIS ONE THOUGH
    try {
        console.log("BEGIN OPINION CLUSTER BY AUTHOR")
        const ops: Array<Op> = [];
        let addOps;
        let geoId;
        
        const turndownService = new TurndownService();
        let res;

        res = await client.query(`
            SELECT 
                o.id, o.cluster_id, oc.judges, o.type, o.author_id, o.author_str, oc.geo_id
            FROM search_opinion o
            LEFT JOIN search_opinioncluster oc ON o.cluster_id = oc.id
            WHERE o.author_id = $1
            AND oc.geo_id IS NULL
            LIMIT 1
        `, [inputId]);

        const authoredOpinionClusters = res.rows;
        
        // Iterate through each person and update with a new geo_id
        for (const authoredOpinionCluster of authoredOpinionClusters) {
            [addOps, geoId] = await processOpinionClusterById(authoredOpinionCluster.cluster_id, client);
            ops.push(...addOps);

            //addOps = await processCitations(authoredOpinionCluster.cluster_id, client)
            //ops.push(...addOps);

            console.log(`Cluster ID: ${authoredOpinionCluster.cluster_id}`);
            
            if (false) {
                
                // Once you have the ops you can publish them to IPFS and your space.
                const txHash = await publish({
                    spaceId,
                    author: walletAddress,
                    editName: `Add opinion ${authoredOpinionCluster.cluster_id}`,
                    ops: ops, // An edit accepts an array of Ops
                });
                console.log("Your transaction hash is:", txHash);

                // I could do this without recursion, I would just need to iterate through clusterIds 
                // with a valid geo_id and add citations for each after anyway
                //await processCitations(authoredOpinionCluster.cluster_id, client);

            }
        }
        
        return ops;
        
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
