import { Client } from 'pg';
import { Image, Id, Ipfs, SystemIds, Relation, Triple, Position, PositionRange, TextBlock, DataBlock } from "@graphprotocol/grc-20";
import { Graph } from "@graphprotocol/grc-20";
import { deploySpace } from "./src/deploy-space";
import { publish } from "./src/publish";
import { createProperty, createType } from "./src/useful_functions";
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';

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
    
        if (propertyChoice !== null) {
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
const spaceId = "Q5YFEacgaHtXE9Kub9AEkA";
const walletAddress = "0x0A77FD6b13d135426c25E605a6A4F39AF72fD967";
const spaceEntityId = "NZ5rgXAwVERHdsyoUSUwPZ";

async function main() {
    try {
        await client.connect();
        console.log('Connected to the database');
        const ops: Array<Op> = [];    
        let addOps;
        let typeId;
        let propertyId;
        let choiceId;
        let blockOps;
        let blockId;
        let blockRelationId;
        let filter;
        


        let entity;
        let pageId;
        let createPageOps

        //NOTE I COULD MAKE PAGE TEMPLATES FOR EACH OF THESE PAGES
        entity = Graph.createEntity({
            name: "Judges",
            types: [SystemIds.PAGE_TYPE],
        });
        pageId = entity.id;
        createPageOps = entity.ops;
        ops.push(...createPageOps)

        addOps = Relation.make({
            fromId: spaceEntityId,
            toId: pageId,
            relationTypeId: SystemIds.TABS_PROPERTY,
        });
        ops.push(addOps);
        

        //CREATE THE DATA BLOCK
        blockOps = DataBlock.make({
            fromId: pageId,
            sourceType: 'QUERY',
            name: "Judges",
            position: PositionRange.FIRST
        });
        ops.push(...blockOps);
        
        //console.log(blockOps)
        blockId = blockOps[2].relation.toEntity
        blockRelationId = blockOps[2].relation.id
        
        let judgeTypeId = await getTypeInfo("Judge", client);
        //SET THE FILTERS FOR THE DATA BLOCK
        filter = `{"where":{"spaces":["${spaceId}"],"AND":[{"attribute":"${SystemIds.TYPES_PROPERTY}","is":"${judgeTypeId}"}]}}`
        //NOTE NEED TO ADD TYPE IS JUDGE TO THIS, BUT NOW IT CAN BE PERSON
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

        let columns_list = ["Political affiliation", "Works at", "Worked at"];
        for (const col of columns_list) {
            [propertyId, choiceId] = await getPropertyInfo("Judge", col, null, client)
            addOps = Relation.make({
                fromId: blockRelationId,
                toId: propertyId,
                relationTypeId: SystemIds.SHOWN_COLUMNS,
            });
            ops.push(addOps);
        }

        
        //NOTE I COULD MAKE PAGE TEMPLATES FOR EACH OF THESE PAGES
        entity = Graph.createEntity({
            name: "Courts",
            types: [SystemIds.PAGE_TYPE],
        });
        pageId = entity.id;
        createPageOps = entity.ops;
        ops.push(...createPageOps)

        addOps = Relation.make({
            fromId: spaceEntityId,
            toId: pageId,
            relationTypeId: SystemIds.TABS_PROPERTY,
        });
        ops.push(addOps);

        
        let res;
        res = await client.query(`
            SELECT 
                *
            FROM jurisdictions_court
        `);

        const jurisdictions = res.rows

        for (const jurisdiction of jurisdictions) {
            //ADD THE PROPERTIES DATA BLOCK
            //CREATE THE DATA BLOCK
            blockOps = DataBlock.make({
                fromId: pageId,
                sourceType: 'QUERY',
                name: `${jurisdiction.name} Courts`,
                position: Position.createBetween()
            });
            ops.push(...blockOps);
            
            //console.log(blockOps)
            blockId = blockOps[2].relation.toEntity
            blockRelationId = blockOps[2].relation.id
    
            //SET THE FILTERS FOR THE DATA BLOCK
            let courtTypeId = await getTypeInfo("Court", client);
            let jurisdictionTypeId = await getTypeInfo("Jurisdiction", client);
            //SET THE FILTERS FOR THE DATA BLOCK
            filter = `{"where":{"spaces":["${spaceId}"],"AND":[{"attribute":"${SystemIds.TYPES_PROPERTY}","is":"${courtTypeId}"},{"attribute":"${jurisdictionTypeId}","is":"${jurisdiction.geo_id}"}]}}`
            //NOTE NEED TO ADD TYPE IS JUDGE TO THIS, BUT NOW IT CAN BE PERSON
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
    
            columns_list = ["Jurisdiction"];
            for (const col of columns_list) {
                [propertyId, choiceId] = await getPropertyInfo("Court", col, null, client)
                addOps = Relation.make({
                    fromId: blockRelationId,
                    toId: propertyId,
                    relationTypeId: SystemIds.SHOWN_COLUMNS,
                });
                ops.push(addOps);
            }
        }


        //NOTE I COULD MAKE PAGE TEMPLATES FOR EACH OF THESE PAGES
        entity = Graph.createEntity({
            name: "Data Sources",
            types: [SystemIds.PAGE_TYPE],
        });
        pageId = entity.id;
        createPageOps = entity.ops;
        ops.push(...createPageOps)

        addOps = Relation.make({
            fromId: spaceEntityId,
            toId: pageId,
            relationTypeId: SystemIds.TABS_PROPERTY,
        });
        ops.push(addOps);
        

        //CREATE THE DATA BLOCK
        blockOps = DataBlock.make({
            fromId: pageId,
            sourceType: 'QUERY',
            name: "Data Sources",
            position: PositionRange.FIRST
        });
        ops.push(...blockOps);
        
        //console.log(blockOps)
        blockId = blockOps[2].relation.toEntity
        blockRelationId = blockOps[2].relation.id
        
        //SET THE FILTERS FOR THE DATA BLOCK
        filter = `{"where":{"spaces":["${spaceId}"],"AND":[{"attribute":"${SystemIds.TYPES_PROPERTY}","is":"${"9vk7Q3pz7US3s2KePFQrJT"}"}]}}`
        //NOTE NEED TO ADD TYPE IS JUDGE TO THIS, BUT NOW IT CAN BE PERSON
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

        addOps = Relation.make({
            fromId: blockRelationId,
            toId: SystemIds.DESCRIPTION_PROPERTY,
            relationTypeId: SystemIds.SHOWN_COLUMNS,
        });
        ops.push(addOps);

        
        //NOTE I COULD MAKE PAGE TEMPLATES FOR EACH OF THESE PAGES
        entity = Graph.createEntity({
            name: "Ontology",
            types: [SystemIds.PAGE_TYPE],
        });
        pageId = entity.id;
        createPageOps = entity.ops;
        ops.push(...createPageOps)

        addOps = Relation.make({
            fromId: spaceEntityId,
            toId: pageId,
            relationTypeId: SystemIds.TABS_PROPERTY,
        });
        ops.push(addOps);
        

        //CREATE THE DATA BLOCK
        blockOps = DataBlock.make({
            fromId: pageId,
            sourceType: 'QUERY',
            name: "Types",
            position: PositionRange.FIRST
        });
        ops.push(...blockOps);
        
        //console.log(blockOps)
        blockId = blockOps[2].relation.toEntity
        blockRelationId = blockOps[2].relation.id

        //SET THE FILTERS FOR THE DATA BLOCK
        filter = `{"where":{"spaces":["${spaceId}"],"AND":[{"attribute":"${SystemIds.TYPES_PROPERTY}","is":"${SystemIds.SCHEMA_TYPE}"}]}}`
        //NOTE NEED TO ADD TYPE IS JUDGE TO THIS, BUT NOW IT CAN BE PERSON
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

        //ADD COLUMNS -  let columns_list = ["Description", "Properties"];
        addOps = Relation.make({
            fromId: blockRelationId,
            toId: SystemIds.DESCRIPTION_PROPERTY,
            relationTypeId: SystemIds.SHOWN_COLUMNS,
        });
        ops.push(addOps);

        addOps = Relation.make({
            fromId: blockRelationId,
            toId: SystemIds.PROPERTIES,
            relationTypeId: SystemIds.SHOWN_COLUMNS,
        });
        ops.push(addOps);


        //ADD THE PROPERTIES DATA BLOCK
        //CREATE THE DATA BLOCK
        blockOps = DataBlock.make({
            fromId: pageId,
            sourceType: 'QUERY',
            name: "Properties",
            position: Position.createBetween()
        });
        ops.push(...blockOps);
        
        //console.log(blockOps)
        blockId = blockOps[2].relation.toEntity
        blockRelationId = blockOps[2].relation.id

        //SET THE FILTERS FOR THE DATA BLOCK
        filter = `{"where":{"spaces":["${spaceId}"],"AND":[{"attribute":"${SystemIds.TYPES_PROPERTY}","is":"${SystemIds.PROPERTY}"}]}}`
        //NOTE NEED TO ADD TYPE IS JUDGE TO THIS, BUT NOW IT CAN BE PERSON
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

        //ADD COLUMNS -  let columns_list = ["Description", "VALUE_TYPE_PROPERTY", "RELATION_VALUE_RELATIONSHIP_TYPE"];
        addOps = Relation.make({
            fromId: blockRelationId,
            toId: SystemIds.DESCRIPTION_PROPERTY,
            relationTypeId: SystemIds.SHOWN_COLUMNS,
        });
        ops.push(addOps);

        addOps = Relation.make({
            fromId: blockRelationId,
            toId: SystemIds.VALUE_TYPE_PROPERTY,
            relationTypeId: SystemIds.SHOWN_COLUMNS,
        });
        ops.push(addOps);

        addOps = Relation.make({
            fromId: blockRelationId,
            toId: SystemIds.RELATION_VALUE_RELATIONSHIP_TYPE,
            relationTypeId: SystemIds.SHOWN_COLUMNS,
        });
        ops.push(addOps);

        
        let res;
        res = await client.query(`
            SELECT 
                *
            FROM cl_types
            WHERE choices IS NOT NULL
        `);

        const contentTypes = res.rows

        for (const contentType of contentTypes) {
            //ADD THE PROPERTIES DATA BLOCK
            //CREATE THE DATA BLOCK
            blockOps = DataBlock.make({
                fromId: pageId,
                sourceType: 'QUERY',
                name: `${contentType.name} Types`,
                position: Position.createBetween()
            });
            ops.push(...blockOps);
            
            //console.log(blockOps)
            blockId = blockOps[2].relation.toEntity
            blockRelationId = blockOps[2].relation.id
    
            //SET THE FILTERS FOR THE DATA BLOCK
            filter = `{"where":{"spaces":["${spaceId}"],"AND":[{"attribute":"${SystemIds.TYPES_PROPERTY}","is":"${contentType.geo_id}"}]}}`
            //NOTE NEED TO ADD TYPE IS JUDGE TO THIS, BUT NOW IT CAN BE PERSON
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
    
            //ADD COLUMNS -  let columns_list = ["Description"];
            addOps = Relation.make({
                fromId: blockRelationId,
                toId: SystemIds.DESCRIPTION_PROPERTY,
                relationTypeId: SystemIds.SHOWN_COLUMNS,
            });
            ops.push(addOps);
        }

        console.log(`Creating Ontology page with ID: ${pageId}`)
        
        
        const txHash = await publish({
    		spaceId,
    		author: walletAddress,
    		editName: "Publish Ontology Page",
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

main();
