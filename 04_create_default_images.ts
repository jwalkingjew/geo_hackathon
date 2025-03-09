//Lots of good information here: https://github.com/freelawproject/courtlistener/blob/main/cl/people_db/models.py

import { Client } from 'pg';
import { Image, Id, Ipfs, SystemIds, Relation, Triple, Position, TextBlock } from "@graphprotocol/grc-20";
import { Graph } from "@graphprotocol/grc-20";
import { deploySpace } from "./src/deploy-space";
import { publish } from "./src/publish";
import { createProperty, createType } from "./src/useful_functions";
import path from 'path';
import * as fs from 'fs';

//CONSTANTS
const spaceId = "Q5YFEacgaHtXE9Kub9AEkA";
const walletAddress = "0x0A77FD6b13d135426c25E605a6A4F39AF72fD967";

//Default Male Image ID: 9JnoWcjFpLrU4M5dGTMsoQ
//Default Female Image ID: VWjhuB2LuScMgykGmNDZbp
//Court Image ID: V57bURTE52Y6xzQpV2ietA
//Opinion group Image ID: WvCXEzUrpcEL1HXKotvQus
//Opinion Image ID: LkvXiYi1cbtGa2zKMgdnMF
//Docket Image ID: JW2tsV6YJu1m3Hp1VHxE9a
//Argument Image ID: PT56MeAMXSqY9BRN5h993c
//Citation Image ID: BWk9j97KSmFJgXTsBPsAxD

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

        const ops: Array<Op> = [];
        let addOps;
        let filepath;
        
        filepath = "/Users/prestonmantel/Documents/geo_hackathon_data/default_images/00_default_judge_male.jpg"
        const { id: imageMaleId, ops: createMaleImageOps } = await Graph.createImage({
          //url: 'https://example.com/image.png',
           blob: new Blob([fs.readFileSync(path.join(filepath))], { type: 'image/jpg' })
        });

        ops.push(...createMaleImageOps)

        console.log(`Default Male Image ID: ${imageMaleId}`)


        filepath = "/Users/prestonmantel/Documents/geo_hackathon_data/default_images/01_default_judge_female.jpg";
        const { id: imageFemaleId, ops: createFemaleImageOps } = await Graph.createImage({
          //url: 'https://example.com/image.png',
           blob: new Blob([fs.readFileSync(path.join(filepath))], { type: 'image/jpg' })
        });

        ops.push(...createFemaleImageOps)

        console.log(`Default Female Image ID: ${imageFemaleId}`)

        
        filepath = "/Users/prestonmantel/Documents/geo_hackathon_data/default_images/02_court.jpg";
        const { id: imageCourtId, ops: createCourtImageOps } = await Graph.createImage({
          //url: 'https://example.com/image.png',
           blob: new Blob([fs.readFileSync(path.join(filepath))], { type: 'image/jpg' })
        });

        ops.push(...createCourtImageOps)

        console.log(`Court Image ID: ${imageCourtId}`)

        
        filepath = "/Users/prestonmantel/Documents/geo_hackathon_data/default_images/03_opinion_group.jpg";
        const { id: imageOpGroupId, ops: createOpGroupImageOps } = await Graph.createImage({
          //url: 'https://example.com/image.png',
           blob: new Blob([fs.readFileSync(path.join(filepath))], { type: 'image/jpg' })
        });

        ops.push(...createOpGroupImageOps)

        console.log(`Opinion group Image ID: ${imageOpGroupId}`)

        
        filepath = "/Users/prestonmantel/Documents/geo_hackathon_data/default_images/04_opinion.jpg";
        const { id: imageOpId, ops: createOpImageOps } = await Graph.createImage({
          //url: 'https://example.com/image.png',
           blob: new Blob([fs.readFileSync(path.join(filepath))], { type: 'image/jpg' })
        });

        ops.push(...createOpImageOps)

        console.log(`Opinion Image ID: ${imageOpId}`)

        
        filepath = "/Users/prestonmantel/Documents/geo_hackathon_data/default_images/05_docket.jpg";
        const { id: imageDocketId, ops: createDocketImageOps } = await Graph.createImage({
          //url: 'https://example.com/image.png',
           blob: new Blob([fs.readFileSync(path.join(filepath))], { type: 'image/jpg' })
        });

        ops.push(...createDocketImageOps)

        console.log(`Docket Image ID: ${imageDocketId}`)

        
        filepath = "/Users/prestonmantel/Documents/geo_hackathon_data/default_images/06_argument.jpg";
        const { id: imageArgId, ops: createArgImageOps } = await Graph.createImage({
          //url: 'https://example.com/image.png',
           blob: new Blob([fs.readFileSync(path.join(filepath))], { type: 'image/jpg' })
        });

        ops.push(...createArgImageOps)

        console.log(`Argument Image ID: ${imageArgId}`)

        
        filepath = "/Users/prestonmantel/Documents/geo_hackathon_data/default_images/07_citation.jpg";
        const { id: imageCitId, ops: createCitImageOps } = await Graph.createImage({
          //url: 'https://example.com/image.png',
           blob: new Blob([fs.readFileSync(path.join(filepath))], { type: 'image/jpg' })
        });

        ops.push(...createCitImageOps)

        console.log(`Citation Image ID: ${imageCitId}`)

        
        
        // Once you have the ops you can publish them to IPFS and your space.
        const txHash = await publish({
            spaceId,
            author: walletAddress,
            editName: "Create Default Images",
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
