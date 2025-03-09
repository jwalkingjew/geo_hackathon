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

    if (name.toLowerCase() === "type") {
        return null;
    } else {
        const res = await client.query(`
            SELECT *
            FROM cl_types
            WHERE name = ${name}
        `);
        return res.rows[0].geo_id;    
    }
}

async function getSourceOfId(name, client): string {
    let typeOfId;

    if (name.toLowerCase() === "type") {
        return null;
    } else {
        const res = await client.query(`
            SELECT *
            FROM sources_list
            WHERE name = $1
        `, [name]);
        return res.rows[0].geo_id;    
    }
}

async function updatePeopleWithGeoId() {
    try {

        //Using new getTypeInfo function, Reconfigure the way that I deal with something if its needed type is not set yet.

        await client.connect();
        console.log('Connected to the database');
        const res = await client.query(`
            SELECT *
            FROM sources_list
        `);

        const sources = res.rows;

        const ops: Array<Op> = [];
        let addOps;
        let typeId;
        
        // Iterate through each person and update with a new geo_id
        for (const source of sources) {
            
            if (!source.geo_id){
                
                let typeOfId = null;
                if (source.type === "Nonprofit") {
                    typeOfId = "RemzN69c24othsp2rP7yMX";
                    
                } else {
                    typeOfId = "9vk7Q3pz7US3s2KePFQrJT";
                }

                //const [opsArray, propertyId] = createType("typeName", "description?", "typeOfId?"))
                [addOps, typeId] = createType(source.name, source.description, typeOfId);
                ops.push(...addOps);
                
                if ((source.projectof !== null) && (source.projectof !== "")) {
                    typeOfId = await getSourceOfId(source.projectof, client)
                    if (typeOfId !== null) {
                        addOps = Relation.make({
                            fromId: typeOfId,
                            toId: typeId,
                            relationTypeId: "EcK9J1zwDzSQPTnBRcUg2A", 
                        });
                        ops.push(addOps);
                    }
                }

                
                // Update the person with the new geo_id
                await client.query('UPDATE sources_list SET geo_id = $1 WHERE name = $2', [typeId, source.name]);
                console.log(`Updated Source ${source.name} with geo_id ${typeId}`);
            }
        }

        //addOps = createProperty("Database Identifier", "text", "A unique identifier used in database construction.", null)
        //ops.push(...addOps)
        
        // Once you have the ops you can publish them to IPFS and your space.
        const txHash = await publish({
            spaceId,
            author: walletAddress,
            editName: "Create Sources",
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
