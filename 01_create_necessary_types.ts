//Lots of good information here: https://github.com/freelawproject/courtlistener/blob/main/cl/people_db/models.py

import { Client } from 'pg';
import { Image, Id, Ipfs, SystemIds, Relation, Triple, Position, TextBlock } from "@graphprotocol/grc-20";
import { Graph } from "@graphprotocol/grc-20";
import { deploySpace } from "./src/deploy-space";
import { publish } from "./src/publish";
import { createProperty, createType } from "./src/useful_functions";

//CONSTANTS
const spaceId = "Q5YFEacgaHtXE9Kub9AEkA";
const walletAddress = "0x0A77FD6b13d135426c25E605a6A4F39AF72fD967";


// PostgreSQL connection details
const client = new Client({
    host: 'localhost', // e.g., 'localhost'
    port: 5432, // Default port
    user: 'postgres',
    password: '',
    database: 'courtlistener',
});

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



async function getTypeOfId(name, client): string {
    let typeOfId;
    if (name === null) {
        return null
    }
    if (name.toLowerCase() === "type") {
        return null;
    } else {
        const res = await client.query(`
            SELECT *
            FROM cl_types
            WHERE name = $1
        `, [name]);
        if (res.rows[0].geo_id != null) {
            return res.rows[0].geo_id;
        } else {
            console.error(`NO GEO ID RESULTS FOR TYPE NAME ${name}`)
            return null;
        }
    }
    
}

async function updatePeopleWithGeoId() {
    try {

        //Using new getTypeInfo function, Reconfigure the way that I deal with something if its needed type is not set yet.

        await client.connect();
        console.log('Connected to the database');
        const res = await client.query(`
            SELECT *
            FROM cl_types
        `);

        const types = res.rows;

        const ops: Array<Op> = [];
        let addOps;
        let typeId;
        
        // Iterate through each person and update with a new geo_id
        for (const type of types) {
            if (type.name == "Role") {
                typeId = type.geo_id;
                if (type.choices !== null) {
                    const choice_res = await client.query(`
                        SELECT *
                        FROM ${type.choices}
                    `);
            
                    const choices = choice_res.rows;

                    for (const choice of choices) {
                        let choiceId;
                        if (!choice.geo_id){
                            //const [opsArray, propertyId] = createType("typeName", "description?", "typeOfId?"))
                            [addOps, choiceId] = createType(choice.value, choice.description, typeId);
                            ops.push(...addOps);
                            
                            // Update the person with the new geo_id
                            await client.query(`UPDATE ${type.choices} SET geo_id = $1 WHERE key = $2`, [choiceId, choice.key]);
                            console.log(`Updated choice ID ${choice.value} key: ${choice.key} with geo_id ${choiceId}`);
                        }
                    }
                }
                
            } else if (!type.geo_id){
                
                let typeOfId = null;
                if (!type.typeofid) {
                    typeOfId = await getTypeOfId(type.typeof, client);
                } else {
                    typeOfId = type.typeofid;
                }

                //const [opsArray, propertyId] = createType("typeName", "description?", "typeOfId?"))
                [addOps, typeId] = createType(type.name, type.description, typeOfId);
                ops.push(...addOps);

                // Update the person with the new geo_id
                await client.query('UPDATE cl_types SET geo_id = $1 WHERE name = $2', [typeId, type.name]);
                console.log(`Updated Type ${type.name} with geo_id ${typeId}`);

                if (type.choices !== null) {
                    const choice_res = await client.query(`
                        SELECT *
                        FROM ${type.choices}
                    `);
            
                    const choices = choice_res.rows;

                    for (const choice of choices) {
                        let choiceId;
                        if (!choice.geo_id){
                            //const [opsArray, propertyId] = createType("typeName", "description?", "typeOfId?"))
                            [addOps, choiceId] = createType(choice.value, choice.description, typeId);
                            ops.push(...addOps);
                            
                            // Update the person with the new geo_id
                            await client.query(`UPDATE ${type.choices} SET geo_id = $1 WHERE key = $2`, [choiceId, choice.key]);
                            console.log(`Updated choice ID ${choice.value} key: ${choice.key} with geo_id ${choiceId}`);
                        }
                    }
                }
            }
        }

        // Once you have the ops you can publish them to IPFS and your space.
        const txHash = await publish({
            spaceId,
            author: walletAddress,
            editName: "Create types",
            ops: ops, // An edit accepts an array of Ops
        });
    
        console.log("Your transaction hash is:", txHash);

        

        
    } catch (error) {
        console.error('Error fetching column names:', error);
    } finally {
        await client.end();
        console.log('Database Closed');
    }
}

// Run the function
updatePeopleWithGeoId();
