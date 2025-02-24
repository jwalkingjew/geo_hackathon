import { Client } from 'pg';
import { Id, Ipfs, SystemIds, Relation, Triple } from "@graphprotocol/grc-20";
import { Graph } from '@graphprotocol/grc-20';
import { deploySpace } from "./src/deploy-space";
import { publish } from "./src/publish";
import { createProperty, createType } from "./src/useful_functions";

//nomination_process: "", //The process by which a person was nominated into this position.
//judicial_committee_action: "", //The action that the judicial committee took in response to a nomination
//vote_type: "s", //The type of vote that resulted in this position.


const mapping = {
    "no_rep": "Not Reported",
    "rep_w_rec": "Reported with Recommendation",
    "rep_wo_rec":"Reported without Recommendation",
    "rec_postpone":"Recommendation Postponed",
    "rec_bad":"Recommended Unfavorably",
};

const mappingDesc = {
    "no_rep": "The committee did not report the nomination for further consideration.",
    "rep_w_rec": "The committee reported the nomination with a positive recommendation.",
    "rep_wo_rec": "The committee reported the nomination without making a recommendation.",
    "rec_postpone": "The committee delayed making a recommendation on the nomination.",
    "rec_bad": "The committee reported the nomination with a negative recommendation.",
};

const baseName = "Judicial Committee action";

let baseId: string = null; //SystemIds.ROLE_PROPERTY;

async function main() {
    // DEFINE NECESSARY CONSTANTS
    const spaceId = "EzQsF1VvvPV5FVqcp6YTtt"
        
    const namePropertyId = SystemIds.NAME_PROPERTY;
    const descriptionPropertyId = SystemIds.DESCRIPTION_PROPERTY;

    const typeSchemaId = SystemIds.SCHEMA_TYPE;
    const typesAttributeId = SystemIds.TYPES_PROPERTY;

    if (baseId === null) {
        
        const opsTypeProperty: Array<Op> = [];
        //const [opsArray, propertyId] = createType("typeName", "description?", "typeOfId?"))
        const [typeOpsArray, typeId] = createType(baseName);
        opsTypeProperty.push(...typeOpsArray);
        //const [opsArray, propertyId] = createProperty("propertyName", "valueType", "description?", "propertyOfId?");
        const [propOpsArray, propId] = createProperty(baseName, "relation", null, null);
        opsTypeProperty.push(...propOpsArray);
        
        // Once you have the ops you can publish them to IPFS and your space.
        const txHash = await publish({
            spaceId,
            author: "0x84713663033dC5ba5699280728545df11e76BCC1",
            editName: `Create ${baseName} Type and Property`,
            ops: opsTypeProperty, // An edit accepts an array of Ops
        });
        //console.log("Your transaction hash is:", txHash);
    
        console.log(`${baseName} Prop ID: "${propId}" - ${baseName} Type ID: "${typeId}"`);

        baseId = typeId
    }
    
    for (let map in mapping) {
        
        const { id: newGeoId, ops: ops } = Graph.createEntity({
            name: mapping[map],
            //description: mappingDesc[map],
            types: [baseId],
        }); 
        console.log(`case "${map}": return "${newGeoId}"`)

        // Once you have the ops you can publish them to IPFS and your space.
    	const txHash = await publish({
    		spaceId,
    		author: "0x84713663033dC5ba5699280728545df11e76BCC1",
    		editName: `Create ${mapping[map]} Entity`,
    		ops: ops, // An edit accepts an array of Ops
    	});
        //console.log("Your transaction hash is:", txHash)
        
        
    }

}

main();


