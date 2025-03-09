//Lots of good information here: https://github.com/freelawproject/courtlistener/blob/main/cl/people_db/models.py
import * as fs from "fs";
import { Client } from 'pg';
import { Id, Ipfs, SystemIds, Relation, Triple } from "@graphprotocol/grc-20";
import { Graph } from "@graphprotocol/grc-20";
import { deploySpace } from "./src/deploy-space";
import { publish } from "./src/publish";
import { format, parse } from "date-fns";
import { processPerson } from "./src/process_person";
import { processPositions } from "./src/process_position";

import { processCourt } from "./src/process_court";
import { processDocket } from "./src/process_docket";
import { processOpinion } from "./src/process_opinion";
import { processArgument } from "./src/process_argument";
import { processOpinionCluster } from "./src/process_opinion_cluster";
import { processOpinionClusterById } from "./src/process_opinion_cluster";
import { processCitations } from "./src/process_citations";
import { processOpinionClusterById } from "./src/process_opinion_cluster_by_cluster_id";

function findInvalidOperations(operations: any[]) {
  return operations.filter(op => {
    // Make sure `op` is not null or undefined before checking its values
    if (op === null || op === undefined) {
      return true; // Treat this operation as invalid
    }

    // Check for undefined or null in the operation or in its properties
    return Object.values(op).some(value => value === null || value === undefined) ||
           (op.triple && Object.values(op.triple).some(value => value === null || value === undefined));
  });
}

async function clearEdited(client) {
    await client.query('UPDATE search_opinioncluster SET edited = $1 WHERE edited = $2', [false, true]);
    await client.query('UPDATE search_opinion SET edited = $1 WHERE edited = $2', [false, true]);
    await client.query('UPDATE search_originatingcourtinformation SET edited = $1 WHERE edited = $2', [false, true]);
    await client.query('UPDATE search_opinionscited SET edited = $1 WHERE edited = $2', [false, true]);
    await client.query('UPDATE search_docket SET edited = $1 WHERE edited = $2', [false, true]);
    await client.query('UPDATE audio_audio SET edited = $1 WHERE edited = $2', [false, true]);
    await client.query('UPDATE search_court SET edited = $1 WHERE edited = $2', [false, true]);
    await client.query('UPDATE people_db_person SET edited = $1 WHERE edited = $2', [false, true]);
    await client.query('UPDATE people_db_position SET edited = $1 WHERE edited = $2', [false, true]);
    console.log('Edits cleared...');
}


// PostgreSQL connection details
const client = new Client({
    host: 'localhost', // e.g., 'localhost'
    port: 5432, // Default port
    user: 'postgres',
    password: '',
    database: 'courtlistener',
});


//const walletAddress = "0x84713663033dC5ba5699280728545df11e76BCC1";
const walletAddress = "0x0A77FD6b13d135426c25E605a6A4F39AF72fD967"; //GEO WALLET
const spaceId = "Q5YFEacgaHtXE9Kub9AEkA";

//Process should be...
// - Iterate through each person, publish all of their authored opinions
// - iterate through each opinioncluster with a geoId and publish all the citations for that paper

async function main() {
    try {
        await client.connect();
        console.log('Connected to the database');

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
        await client.query('UPDATE search_opinionscited SET edited = $1 WHERE edited = $2', [false, true]);
        await client.query('UPDATE search_docket SET edited = $1 WHERE edited = $2', [false, true]);
        await client.query('UPDATE audio_audio SET edited = $1 WHERE edited = $2', [false, true]);
        await client.query('UPDATE search_court SET edited = $1 WHERE edited = $2', [false, true]);
        await client.query('UPDATE people_db_person SET edited = $1 WHERE edited = $2', [false, true]);
        await client.query('UPDATE people_db_position SET edited = $1 WHERE edited = $2', [false, true]);
        console.log('Edits cleared...');
 
        const ops: Array<Op> = [];
        let addOps;
        let geo_id;

        const res = await client.query(`
                    SELECT DISTINCT id 
                    FROM search_opinioncluster
                    WHERE geo_id IS NOT NULL
                `);
//HMiXN7muX3HupBB2uGzc8P
        let pushNeeded = true;
        let outputText;
        let txHash;
        let outId;
        let i;
        // Iterate through each person and update with a new geo_id
        for (const opinion of res.rows) {
            i = 0;
            while((addOps = await processCitations(opinion.id, client)).length > 0) {
                i = i + 1;
                ops.push(...addOps);
            
                pushNeeded = true;
                outId = opinion.id;
    
                if ((ops.length > 6750) && (pushNeeded)) {
                    // Once you have the ops you can publish them to IPFS and your space.
                    txHash = await publish({
                        spaceId,
                        author: walletAddress,
                        editName: `Publish operation Citation ${i} opinion ${outId}`,
                        ops: ops, // An edit accepts an array of Ops
                    });
                    
                    console.log(ops.length)
                    console.log("Your transaction hash is:", txHash);
                    console.log(`Publish operation Citation ${i} opinion ${outId}`)
                    pushNeeded = false
                    await clearEdited(client)
                    // Convert operations to a readable JSON format
                    outputText = JSON.stringify(ops, null, 2);
                    // Write to a text file
                    fs.writeFileSync(`out_ops/publish_${ops.length}_op_citation_${i}_opinion_${outId}.txt`, outputText);
                    ops.length = 0;
                }
            }
        }

        if (pushNeeded) {
            // Once you have the ops you can publish them to IPFS and your space.
            txHash = await publish({
                spaceId,
                author: walletAddress,
                editName: `Publish operation Citation ${i} opinion ${outId}`,
                ops: ops, // An edit accepts an array of Ops
            });

            console.log(ops.length)
            console.log("Your transaction hash is:", txHash);
            console.log(`Publish operation Citation ${i} opinion ${outId}`)
            pushNeeded = false
            await clearEdited(client)
            // Convert operations to a readable JSON format
            outputText = JSON.stringify(ops, null, 2);
            // Write to a text file
            fs.writeFileSync(`out_ops/publish_${ops.length}_op_citation_${i}_opinion_${outId}.txt`, outputText);
            ops.length = 0;
        }

        
    }catch (err) {
        console.error('Error in main:', err);
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
        await client.query('UPDATE search_opinionscited SET edited = $1 WHERE edited = $2', [false, true]);
    } finally {
        // Close the database connection
        await client.end();
        console.log('Database connection closed');
    }
}

main();
