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
    if (res.rows.length > 0) {
        return res.rows[0].geo_id;
    } else {
        return null
    }
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
        if (res.rows.length > 0) {
            return res.rows[0].geo_id;
        } else {
            return null
        }
        return res.rows[0].geo_id;    
    }
    
}


//Using new getTypeInfo function, Reconfigure the way that I deal with something if its needed type is not set yet.
async function createProperties() {
    try {
        //MAKE SURE TO SET THIS BEFORE RUNNING
        const firstRun = false;
        //////////???????????????????????????
        const ops: Array<Op> = [];
        let addOps;
        let propId;
        let propertyOf;
        
        await client.connect();
        console.log('Connected to the database');
        
        const res = await client.query(`
            SELECT *
            FROM all_properties
        `);

        const properties = res.rows;

        for (const property of properties) {
            
            if (!property.geo_id){

                const check =  await client.query(`
                    SELECT *
                    FROM all_properties
                    WHERE name ILIKE ($1)
                    AND geo_id IS NOT NULL
                    AND id <> $2
                `, [property.name, property.id]);

                if (check.rows.length > 0) {
                    await client.query(`UPDATE all_properties SET geo_id = $1 WHERE id = $2`, [check.rows[0].geo_id, property.id]);
                    console.log(`Updated Property ${property.name} for Entity ${property.propertyof} with geo_id ${check.rows[0].geo_id}`);

                    propertyOf = await getTypeInfo(property.propertyof, client);
                    if (propertyOf) {
                        addOps = Relation.make({
                            fromId: propertyOf,
                            toId: check.rows[0].geo_id,
                            relationTypeId: SystemIds.PROPERTIES,
                        });
                        
                        ops.push(addOps);
                    }
                } else {
                
                    //const [opsArray, propertyId] = createProperty("propertyName", "valueType", "description?", "propertyOfId?");
                    [addOps, propId] = createProperty(property.name, property.valuetype, property.description, await getTypeInfo(property.propertyof, client));
                    ops.push(...addOps)
    
                    let typeId;
                    if ((property.relationvalue !== null) && (property.relationvalue !== "")) {
                        if (property.relationvalue === "Person") {
                            typeId = SystemIds.PERSON_TYPE;
                        } else {
                            typeId = await getTypeInfo(property.relationvalue, client);
                        }
                        if (typeId !== null) {
                            addOps = Relation.make({
                                fromId: propId,
                                toId: typeId,
                                relationTypeId: SystemIds.RELATION_VALUE_RELATIONSHIP_TYPE,
                            });
                            ops.push(addOps)
                        }
                    }
                    
                    // Update the person with the new geo_id
                    await client.query(`UPDATE all_properties SET geo_id = $1 WHERE id = $2`, [propId, property.id]);
                    console.log(`Updated Property ${property.name} for Entity ${property.propertyof} with geo_id ${propId}`);
                }
            } 
        }

        if (true) {

            // Once you have the ops you can publish them to IPFS and your space.
            const txHash = await publish({
                spaceId,
                author: walletAddress,
                editName: "Create all properties",
                ops: ops, // An edit accepts an array of Ops
            });
        
            console.log("Your transaction hash is:", txHash);
        }

        

        
    } catch (error) {
        console.error('Error fetching column names:', error);
    } finally {
        await client.end();
        console.log('Database Closed');
    }
}

// Run the function
createProperties();
