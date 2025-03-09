//Lots of good information here: https://github.com/freelawproject/courtlistener/blob/main/cl/people_db/models.py

import { Client } from 'pg';
import { Id, Ipfs, SystemIds, Relation, Triple, DataBlock, Position, PositionRange } from "@graphprotocol/grc-20";
import { deploySpace } from "./deploy-space";
import { publish } from "./publish";
import { format, parse } from 'date-fns';

import { processPerson } from "./process_person";
import { processPositions } from "./process_position";

import { processCourt } from "./process_court";
import { processDocket } from "./process_docket";
import { processOpinion } from "./process_opinion";
import { processArgument } from "./process_argument";
import { processOpinionCluster } from "./process_opinion_cluster";
import { processOpinionClusterById } from "./process_opinion_cluster_by_cluster_id";
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

// DEFINE NECESSARY CONSTANTS
//const spaceId = "YRPckind3wVHcowVvbfx5X"; // Testnet
const spaceId = "Q5YFEacgaHtXE9Kub9AEkA"; // Mainnet
const walletAddress = "0x0A77FD6b13d135426c25E605a6A4F39AF72fD967";

const defaultCitImageId = "BWk9j97KSmFJgXTsBPsAxD";

const endTimePropertyId = "R7X9rnVW49g29XvK5KMTtP";
const startTimePropertyId = "6cF7TMDBFwSt5vMENU3Cta";

const worksAtId = "U1uCAzXsRSTP4vFwo1JwJG";
const workedAtId = "8fvqALeBDwEExJsDeTcvnV";

const webURLPropertyId = "93stf6cgYvBsdPruRzq1KK";

export async function processCitations(inputId, client): [Array<Op>, string] {
    try {
        console.log("BEGIN CITATIONS")
        const ops: Array<Op> = [];
        let addOps;
        
        let res;
        let fjc_link = false;
        res = await client.query(`
            SELECT
                oc.id, oc.geo_id, oc.cited_opinion_id, oc.citing_opinion_id, oc.depth, p.text, p.score, 
                o.cluster_id as cited_cluster_id, o_clust.geo_id as cited_opinion_geo_id, 
                oo.cluster_id as citing_cluster_id, oo_clust.geo_id as citing_opinion_geo_id, oo_clust.slug
            FROM search_opinionscited as oc
            LEFT JOIN search_parenthetical_v2 as p 
                ON (oc.cited_opinion_id = p.described_opinion_id
                AND oc.citing_opinion_id = p.describing_opinion_id)
            LEFT JOIN search_opinion as o
                ON o.id = oc.cited_opinion_id 
            LEFT JOIN search_opinion as oo
                ON oo.id = oc.citing_opinion_id 
            LEFT JOIN search_opinioncluster as o_clust
                ON o.cluster_id = o_clust.id
            LEFT JOIN search_opinioncluster as oo_clust
                ON oo.cluster_id = oo_clust.id
            WHERE oo_clust.geo_id IS NOT NULL
                AND oo.cluster_id = $1
            LIMIT 1
        `, [inputId]);

        const citations = res.rows;
        
        // Iterate through each person and update with a new geo_id
        for (const citation of citations) {
            
            console.log(`\n------\nNEW CITATION\n------\n`);

            
            let propertyId;
            let choiceId;
            let typeId;
            let relationId;
            let newGeoId: string;
            let addVar;
            let opinionId
            let geoId;
            let citedOpinionId;
            
            if (!citation.geo_id){

                [addOps, citedOpinionId] = await processOpinionClusterById(citation.cited_cluster_id, client);
                ops.push(...addOps)

                if ((citedOpinionId != null) && (citedOpinionId != "")) {
                    //Make a relation from cited cluster to citing cluster
                    [propertyId, choiceId] = await getPropertyInfo("Opinion Group", "Authorities", null, client);
                    addOps = Relation.make({
                        fromId: citation.citing_opinion_geo_id,
                        toId: citedOpinionId,
                        relationTypeId: propertyId,
                    });
                    newGeoId = addOps.relation.id;
                    ops.push(addOps);

                    if ((citation.text != null) && (citation.text != "")) {
                        [propertyId, choiceId] = await getPropertyInfo("Authorities", "Parenthetical", null, client);
                        //Create Entity and set the name
                        addOps = Triple.make({
                    		entityId: newGeoId,
                            attributeId: propertyId,
                    		value: {
                    			type: "TEXT",
                    			value: citation.text,
                    		},
                    	});
                        ops.push(addOps);
                    }

                    if (defaultCitImageId != "") {
                        addOps = Relation.make({
                            fromId: newGeoId,
                            toId: defaultCitImageId,
                            relationTypeId: "7YHk6qYkNDaAtNb8GwmysF", //COVER PROPERTY
                        });
                        ops.push(addOps);
                    }

                    if ((citation.depth != null) && (citation.depth != "")) {
                        [propertyId, choiceId] = await getPropertyInfo("Authorities", "Citation count", null, client);
                        //Create Entity and set the name
                        addOps = Triple.make({
                    		entityId: newGeoId,
                            attributeId: propertyId,
                    		value: {
                    			type: "NUMBER",
                    			value: citation.depth.toString(),
                    		},
                    	});
                        ops.push(addOps);
                    }

                    //[propertyId, choiceId] = await getPropertyInfo("Authorities", "Parenthetical score", null, client);
                    ////Create Entity and set the name
                    //addOps = Triple.make({
                	//	entityId: relationId,
                    //    attributeId: propertyId,
                	//	value: {
                	//		type: "NUMBER",
                	//		value: citation.score.toString(),
                	//	},
                	//});
                    //ops.push(addOps);

                    let sourceId;
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
    
                        if (citation.id != null) {
                            [propertyId, choiceId] = await getPropertyInfo("source", "Database identifier", null, client);
                            addOps = Triple.make({
                                entityId: relationId,
                                attributeId: propertyId,
                                value: {
                                    type: "TEXT",
                                    value: citation.id.toString(),
                                },
                            });
                            ops.push(addOps)
    
                            addOps = Triple.make({
                                entityId: relationId,
                                attributeId: SystemIds.DESCRIPTION_PROPERTY,
                                value: {
                                    type: "TEXT",
                                    value: "Citation",
                                },
                            });
                            ops.push(addOps)

                            if ((citation.slug != null) && (citation.slug != "")) {
                                addOps = Triple.make({
                                    entityId: relationId,
                                    attributeId: webURLPropertyId,
                                    value: {
                                        type: "URL",
                                        value: `https://www.courtlistener.com/opinion/${citation.citing_cluster_id.toString()}/${citation.slug}/authorities/`,
                                    },
                                });
                                ops.push(addOps)
                            }
                        }
                    };
                    
                    //// Update the person with the new geo_id
                    await client.query('UPDATE search_opinionscited SET geo_id = $1 WHERE id = $2', [newGeoId, citation.id]);
                    await client.query('UPDATE search_opinionscited SET edited = $1 WHERE id = $2', [true, citation.id]);
                    console.log(`Updated Citation ID ${citation.id} with geo_id ${newGeoId}`);

                }
            }
        }
        return ops
    } catch (err) {
        console.error('Error updating citation:', err);
        await client.query('UPDATE people_db_position SET geo_id = $1 WHERE edited = $2', [null, true]);
        await client.query('UPDATE people_db_person SET geo_id = $1 WHERE edited = $2', [null, true]);
        await client.query('UPDATE search_court SET geo_id = $1 WHERE edited = $2', [null, true]);
        await client.query('UPDATE audio_audio SET geo_id = $1 WHERE edited = $2', [null, true]);
        await client.query('UPDATE search_docket SET geo_id = $1 WHERE edited = $2', [null, true]);
        await client.query('UPDATE search_originatingcourtinformation SET geo_id = $1 WHERE edited = $2', [null, true]);
        await client.query('UPDATE search_opinion SET geo_id = $1 WHERE edited = $2', [null, true]);
        await client.query('UPDATE search_opinioncluster SET geo_id = $1 WHERE edited = $2', [null, true]);
        await client.query('UPDATE search_opinionscited SET geo_id = $1 WHERE edited = $2', [null, true]);

        await client.query('UPDATE search_opinioncluster SET edited = $1 WHERE edited = $2', [false, true]);
        await client.query('UPDATE search_opinion SET edited = $1 WHERE edited = $2', [false, true]);
        await client.query('UPDATE search_originatingcourtinformation SET edited = $1 WHERE edited = $2', [false, true]);
        await client.query('UPDATE search_docket SET edited = $1 WHERE edited = $2', [false, true]);
        await client.query('UPDATE audio_audio SET edited = $1 WHERE edited = $2', [false, true]);
        await client.query('UPDATE search_court SET edited = $1 WHERE edited = $2', [false, true]);
        await client.query('UPDATE people_db_person SET edited = $1 WHERE edited = $2', [false, true]);
        await client.query('UPDATE people_db_position SET edited = $1 WHERE edited = $2', [false, true]);
        await client.query('UPDATE search_opinionscited SET geo_id = $1 WHERE edited = $2', [null, true]);
        
    }
}
