//Lots of good information here: https://github.com/freelawproject/courtlistener/blob/main/cl/people_db/models.py

import { Client } from 'pg';
import { Id, Ipfs, SystemIds, Relation, Triple, DataBlock, Position, PositionRange } from "@graphprotocol/grc-20";
import { deploySpace } from "./deploy-space";
import { publish } from "./publish";
import { processPerson } from "./process_person";
import { processCourt } from "./process_court";
import { format, parse } from 'date-fns';

const positionMapping = {
    "jud": "Judge",
    "jus": "Justice",
    "ad-law-jud": "Administrative Law Judge",
    "act-jud": "Acting Judge",
    "act-jus": "Acting Justice",
    "act-pres-jud": "Acting Presiding Judge",
    "act-c-admin-jus": "Acting Chief Administrative Justice",
    "ad-pres-jus": "Administrative Presiding Justice",
    "ass-jud": "Associate Judge",
    "ass-jus": "Associate Justice",
    "ass-c-jud": "Associate Chief Judge",
    "asst-pres-jud": "Assistant Presiding Judge",
    "ass-pres-jud": "Associate Presiding Judge",
    "c-jud": "Chief Judge",
    "c-jus": "Chief Justice",
    "c-spec-m": "Chief Special Master",
    "c-admin-jus": "Chief Administrative Justice",
    "c-spec-tr-jud": "Chief Special Trial Judge",
    "pres-jud": "Presiding Judge",
    "pres-jus": "Presiding Justice",
    "sup-jud": "Supervising Judge",
    "com": "Commissioner",
    "com-dep": "Deputy Commissioner",
    "jud-pt": "Judge Pro Tem",
    "jus-pt": "Justice Pro Tem",
    "ref-jud-tr": "Judge Trial Referee",
    "ref-off": "Official Referee",
    "ref-state-trial": "State Trial Referee",
    "ret-act-jus": "Active Retired Justice",
    "ret-ass-jud": "Retired Associate Judge",
    "ret-c-jud": "Retired Chief Judge",
    "ret-jus": "Retired Justice",
    "ret-senior-jud": "Senior Judge",
    "mag": "Magistrate",
    "c-mag": "Chief Magistrate",
    "pres-mag": "Presiding Magistrate",
    "mag-pt": "Magistrate Pro Tem",
    "mag-rc": "Magistrate (Recalled)",
    "mag-part-time": "Magistrate (Part-Time)",
    "spec-chair": "Special Chairman",
    "spec-jud": "Special Judge",
    "spec-m": "Special Master",
    "spec-scjcbc": "Special Superior Court Judge for Complex Business Cases",
    "spec-tr-jud": "Special Trial Judge",
    "chair": "Chairman",
    "chan": "Chancellor",
    "presi-jud": "President",
    "res-jud": "Reserve Judge",
    "trial-jud": "Trial Judge",
    "vice-chan": "Vice Chancellor",
    "vice-cj": "Vice Chief Judge",
    "att-gen": "Attorney General",
    "att-gen-ass": "Assistant Attorney General",
    "att-gen-ass-spec": "Special Assistant Attorney General",
    "sen-counsel": "Senior Counsel",
    "dep-sol-gen": "Deputy Solicitor General",
    "pres": "President of the United States",
    "gov": "Governor",
    "mayor": "Mayor",
    "clerk": "Clerk",
    "clerk-chief-dep": "Chief Deputy Clerk",
    "staff-atty": "Staff Attorney",
    "prof": "Professor",
    "adj-prof": "Adjunct Professor",
    "prac": "Practitioner",
    "pros": "Prosecutor",
    "pub-def": "Public Defender",
    "da": "District Attorney",
    "ada": "Assistant District Attorney",
    "legis": "Legislator",
    "sen": "Senator",
    "state-sen": "State Senator",
};

function getJobKeyFromValue(value: string): string | null {
    return Object.keys(positionMapping).find(key => positionMapping[key] === value) || null;
}

function outputSuffix(suffix: string): string | null{
    if (!suffix) return null; // Handle missing date
    switch (suffix.toLowerCase()) {
        case "jr": return "Jr.";
        case "sr": return "Sr.";
        case "1": return "I";
        case "2": return "II";
        case "3": return "III";
        case "4": return "IV";
        case "5": return "V";
        default:
            return null;
    }
}

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

function getDateFormat(format: string): string | null{
    if (!format) return null; // Handle missing format
    switch (format) {
        case "%Y": return "yyyy"; // Year only
        case "%Y-%m": return "MMMM yyyy"; // Month and year
        case "%Y-%m-%d": return "MMMM d, yyyy"; // Full date
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
                        format: "yyyy-MM-dd",
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


async function addSources(entity, newGeoId, client, include_fjc: boolean = true): Array<Op> {
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

        if (entity.id != null) {
            [propertyId, choiceId] = await getPropertyInfo("source", "Database identifier", null, client);
            addOps = Triple.make({
                entityId: relationId,
                attributeId: propertyId,
                value: {
                    type: "TEXT",
                    value: entity.id.toString(),
                },
            });
            ops.push(addOps)

            addOps = Triple.make({
                entityId: relationId,
                attributeId: SystemIds.DESCRIPTION_PROPERTY,
                value: {
                    type: "TEXT",
                    value: "Position",
                },
            });
            ops.push(addOps)

            if ((entity.slug != null) && (entity.slug != "")) {
                addOps = Triple.make({
                    entityId: relationId,
                    attributeId: webURLPropertyId,
                    value: {
                        type: "URL",
                        value: `https://www.courtlistener.com/person/${entity.person_id.toString()}/${entity.slug}`,
                    },
                });
                ops.push(addOps);
            }
        }
    }

    if (include_fjc) {
        if (entity.fjc_id != null) {
            sourceId = await getSourceInfo("Federal Judicial Center", client)
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
                        value: entity.fjc_id.toString(),
                    },
                });
                ops.push(addOps)
    
                addOps = Triple.make({
                    entityId: relationId,
                    attributeId: webURLPropertyId,
                    value: {
                        type: "URL",
                        value: `https://www.fjc.gov/sites/default/files/history/judges.csv`,
                        //value: "https://www.fjc.gov/sites/default/files/history/categories.xlsx",
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

const endTimePropertyId = "R7X9rnVW49g29XvK5KMTtP";
const startTimePropertyId = "6cF7TMDBFwSt5vMENU3Cta";

const worksAtId = "U1uCAzXsRSTP4vFwo1JwJG";
const workedAtId = "8fvqALeBDwEExJsDeTcvnV";

const webURLPropertyId = "93stf6cgYvBsdPruRzq1KK";

export async function processPositions(input_person_id, client): Array<Op> {
    try {
        console.log("BEGIN POSITION")
        const ops: Array<Op> = [];
        let addOps;
        
        const res = await client.query(`
            SELECT 
                p.*,
                c.geo_id as court_geo_id,
                per.geo_id as person_geo_id,
                per.fjc_id, per.slug, per.id as person_id
            FROM people_db_position as p
            LEFT JOIN search_court c ON p.court_id = c.id
            LEFT JOIN people_db_person per ON p.person_id = per.id
            WHERE p.person_id = $1
        `, [input_person_id]);
        
        const positions = res.rows;
        

        // Iterate through each person and update with a new geo_id
        for (const position of positions) {
            
            if (!position.geo_id){
                let propertyId;
                let choiceId;
                let typeId;
                let relationId;
                
                

                //If they have a position like US President or Senator -> 
                //Just give them a role property pointing to that thing and input the start and dates on that relationship

                
                let positionRelationId;
                if ((position.court_id != null) && (position.position_type != null || getJobKeyFromValue(position.job_title) != null)){
                    //Position has a court_id -> Publish the job

                    let courtGeoId;
                    if (position.court_geo_id != null) {
                        courtGeoId = position.court_geo_id;
                    } else {
                        [addOps, courtGeoId] = await processCourt(position.court_id, client);
                        ops.push(...addOps);
                    }
                    
                    
                    if ((position.date_termination != null) || (position.date_retirement != null)) {
                        //Termination date exists -> WorkedAt Relation Type
                        addOps = Relation.make({
                    		fromId: position.person_geo_id,
                    		toId: courtGeoId,
                    		relationTypeId: workedAtId,
                    	});
                        positionRelationId = addOps.relation.id;
                        ops.push(addOps);

                        console.log(`Court GEO ID: ${courtGeoId}`)
                        console.log(`PositionRelationId: ${positionRelationId}`)

                        
                    } else {
                        //No Termination date exists -> WorksAt Relation Type
                        addOps = Relation.make({
                    		fromId: position.person_geo_id,
                    		toId: courtGeoId,
                    		relationTypeId: worksAtId,
                    	});
                        positionRelationId = addOps.relation.id;
                        ops.push(addOps);

                        console.log(`Court GEO ID: ${courtGeoId}`)
                        console.log(`PositionRelationId: ${positionRelationId}`)
                    }

                    if ((position.position_type != null)  && (position.position_type != "")) {
                        [propertyId, choiceId] = await getPropertyInfo("position", "Role", position.position_type, client)
                        addOps = Relation.make({
                            fromId: positionRelationId,
                            toId: choiceId,
                            relationTypeId: SystemIds.ROLE_PROPERTY,
                        });
                        ops.push(addOps);
                        
                        relationId = addOps.relation.id;
                        addOps = await addSources(position, relationId, client);
                        ops.push(...addOps);
                    } else if ((position.job_title != null)  && (position.job_title != "")) {
                        [propertyId, choiceId] = await getPropertyInfo("position", "Role", position.job_title, client)
                        addOps = Relation.make({
                            fromId: positionRelationId,
                            toId: choiceId,
                            relationTypeId: SystemIds.ROLE_PROPERTY,
                        });
                        ops.push(addOps);
                        relationId = addOps.relation.id;
                        addOps = await addSources(position, relationId, client);
                        ops.push(...addOps);
                    }
                    
                    
                    if ((position.date_start != null)  && (position.date_start != "")) {
                        //if not null, set start date
                        addOps = postDate(positionRelationId, startTimePropertyId, position.date_start, position.date_granularity_start)
                        ops.push(addOps);
                    }
                    if ((position.date_termination != null)  && (position.date_termination != "")) {
                        addOps = postDate(positionRelationId, endTimePropertyId, position.date_termination, position.date_granularity_termination)
                        ops.push(addOps);

                        if ((position.termination_reason != null)  && (position.termination_reason != "")) {
                            //Relate to termination reason
                            [propertyId, choiceId] = await getPropertyInfo("position", "Termination reason", position.termination_reason, client)
                            addOps = Relation.make({
                        		fromId: positionRelationId,
                        		toId: choiceId,
                        		relationTypeId: propertyId,
                        	});
                            ops.push(addOps);
                            relationId = addOps.relation.id;
                            addOps = await addSources(position, relationId, client);
                            ops.push(...addOps);
                        }
                    }

                    //Create Retirement Date Property
                    if ((position.date_retirement != null)  && (position.date_retirement != "")) {
                        [propertyId, choiceId] = await getPropertyInfo("position", "Date retired", null, client)
                        addOps = postDate(positionRelationId, propertyId, position.date_retirement, position.date_granularity_start)
                        ops.push(addOps);
                    }

                    if ((position.sector != null)  && (position.sector != "")) {
                        [propertyId, choiceId] = await getPropertyInfo("position", "Sector", position.sector, client)
                        addOps = Relation.make({
                            fromId: positionRelationId,
                            toId: choiceId,
                            relationTypeId: propertyId,
                        });
                        ops.push(addOps);
                        relationId = addOps.relation.id;
                        addOps = await addSources(position, relationId, client, false);
                        ops.push(...addOps);
                    }

                    

                    //Create Supervisor Property
                    if ((position.supervisor_id != null)  && (position.supervisor_id != "")) {
                        [propertyId, choiceId] = await getPropertyInfo("position", "Supervisor", null, client)
                        //is this person created? Turn this into a function!
                        let supervisorGeoId;
                        [addOps, supervisorGeoId]  = await processPerson(position.supervisor_id, client);
                        ops.push(...addOps);
                        
                        addOps = Relation.make({
                            fromId: positionRelationId,
                            toId: supervisorGeoId,
                            relationTypeId: propertyId,
                        });
                        ops.push(addOps);

                        relationId = addOps.relation.id;
                        addOps = await addSources(position, relationId, client, false);
                        ops.push(...addOps);
                    }
                    
                    //Create Predecessor Property
                    if ((position.predecessor_id != null)  && (position.predecessor_id != "")) {
                        [propertyId, choiceId] = await getPropertyInfo("position", "Predecessor", null, client)
                        //is this person created? Turn this into a function!
                        let predecessorGeoId;
                        [addOps, predecessorGeoId] = await processPerson(position.predecessor_id, client);
                        ops.push(...addOps);
                        
                        addOps = Relation.make({
                            fromId: positionRelationId,
                            toId: predecessorGeoId,
                            relationTypeId: propertyId,
                        });
                        ops.push(addOps);

                        relationId = addOps.relation.id;
                        addOps = await addSources(position, relationId, client, false);
                        ops.push(...addOps);
                    }
                    
                    //Create Selection Method Relationship
                    if ((position.how_selected != null)  && (position.how_selected != "")) {
                        [propertyId, choiceId] = await getPropertyInfo("position", "Selection Method", position.how_selected, client)
                        addOps = Relation.make({
                    		fromId: positionRelationId,
                    		toId: choiceId,
                    		relationTypeId: propertyId,
                    	});
                        ops.push(addOps);

                        relationId = addOps.relation.id;
                        addOps = await addSources(position, relationId, client);
                        ops.push(...addOps);
                    }
                    
                    if ((position.appointer_id != null)  && (position.appointer_id != "")) {
                        let appointer;
                        const appRes = await client.query(`
                            SELECT *
                            FROM people_db_position
                            WHERE id = ${position.appointer_id}
                        `);
                
                        appointer = appRes.rows[0].person_id;
                        
                        [propertyId, choiceId] = await getPropertyInfo("position", "Appointed by", null, client)
                        let appointerGeoId
                        [addOps, appointerGeoId] = await processPerson(appointer, client);
                        ops.push(...addOps);
                        
                        addOps = Relation.make({
                            fromId: positionRelationId,
                            toId: appointerGeoId,
                            relationTypeId: propertyId,
                        });
                        ops.push(addOps);

                        relationId = addOps.relation.id;
                        addOps = await addSources(position, relationId, client);
                        ops.push(...addOps);
                    }

                    if ((position.nomination_process != null)  && (position.nomination_process != "")) {
                        [propertyId, choiceId] = await getPropertyInfo("position", "Nomination process", position.nomination_process, client)
                        addOps = Relation.make({
                            fromId: positionRelationId,
                            toId: choiceId,
                            relationTypeId: propertyId,
                        });
                        ops.push(addOps);

                        relationId = addOps.relation.id;
                        addOps = await addSources(position, relationId, client);
                        ops.push(...addOps);
                    }

                    if ((position.date_nominated != null)  && (position.date_nominated != "")) {
                        [propertyId, choiceId] = await getPropertyInfo("position", "Date nominated", null, client)
                        addOps = postDate(positionRelationId, propertyId, position.date_nominated, null)
                        ops.push(addOps);
                    }

                    if ((position.judicial_committee_action != null) && (position.judicial_committee_action != "")) {
                        [propertyId, choiceId] = await getPropertyInfo("position", "Judicial Committee actions", position.judicial_committee_action, client)
                        addOps = Relation.make({
                            fromId: positionRelationId,
                            toId: choiceId,
                            relationTypeId: propertyId,
                        });
                        ops.push(addOps);

                        relationId = addOps.relation.id;
                        addOps = await addSources(position, relationId, client);
                        ops.push(...addOps);
                    }

                    if ((position.date_referred_to_judicial_committee != null)  && (position.date_referred_to_judicial_committee != "")) {
                        [propertyId, choiceId] = await getPropertyInfo("position", "Date referred to judicial committee", null, client)
                        addOps = postDate(positionRelationId, propertyId, position.date_referred_to_judicial_committee, null)
                        ops.push(addOps);
                    }
                    
                    if ((position.date_judicial_committee_action != null)  && (position.date_judicial_committee_action != "")) {
                        [propertyId, choiceId] = await getPropertyInfo("position", "Date of judicial committee action", null, client)
                        addOps = postDate(positionRelationId, propertyId, position.date_judicial_committee_action, null)
                        ops.push(addOps);
                    }

                    if ((position.date_elected != null)  && (position.date_elected != "")) {
                        [propertyId, choiceId] = await getPropertyInfo("position", "Date elected", null, client)
                        addOps = postDate(positionRelationId, propertyId, position.date_elected, null)
                        ops.push(addOps);
                    }
                    
                    if ((position.date_recess_appointment != null)  && (position.date_recess_appointment != "")) {
                        [propertyId, choiceId] = await getPropertyInfo("position", "Date of recess appointment", null, client)
                        addOps = postDate(positionRelationId, propertyId, position.date_recess_appointment, null)
                        ops.push(addOps);
                    }
                    
                    if ((position.date_hearing != null)  && (position.date_hearing != "")) {
                        [propertyId, choiceId] = await getPropertyInfo("position", "Date hearing", null, client)
                        addOps = postDate(positionRelationId, propertyId, position.date_hearing, null)
                        ops.push(addOps);
                    }
                    
                    if ((position.date_confirmation != null)  && (position.date_confirmation != "")) {
                        [propertyId, choiceId] = await getPropertyInfo("position", "Date confirmed", null, client)
                        addOps = postDate(positionRelationId, propertyId, position.date_confirmation, null)
                        ops.push(addOps);
                    }
                    
                    if ((position.vote_type != null)  && (position.vote_type != "")) {
                        [propertyId, choiceId] = await getPropertyInfo("position", "Vote type", position.vote_type, client)
                        addOps = Relation.make({
                            fromId: positionRelationId,
                            toId: choiceId,
                            relationTypeId: propertyId,
                        });
                        ops.push(addOps);

                        relationId = addOps.relation.id;
                        addOps = await addSources(position, relationId, client);
                        ops.push(...addOps);
                    }
                    if ((position.voice_vote != null)) {
                        [propertyId, choiceId] = await getPropertyInfo("position", "Voice vote", null, client)
                        let check_val;
                        if (position.voice_vote) {
                            check_val = "1";
                        } else {
                            check_val = "0";
                        }
                        addOps = Triple.make({
                            entityId: positionRelationId,
                            attributeId: propertyId,
                            value: {
                                type: "CHECKBOX",
                                value: check_val,
                            },
                        });
                        ops.push(addOps);
                    }

                    if ((position.votes_yes != null)  && (position.votes_yes != "")) {
                        [propertyId, choiceId] = await getPropertyInfo("position", "Votes yes", null, client)
                        addOps = Triple.make({
                            entityId: positionRelationId,
                            attributeId: propertyId,
                            value: {
                                type: "NUMBER",
                                value: position.votes_yes.toString(),
                            },
                        });
                        ops.push(addOps);
                    }

                    if ((position.votes_no != null)  && (position.votes_no != "")) {
                        [propertyId, choiceId] = await getPropertyInfo("position", "Votes no", null, client)
                        addOps = Triple.make({
                            entityId: positionRelationId,
                            attributeId: propertyId,
                            value: {
                                type: "NUMBER",
                                value: position.votes_no.toString(),
                            },
                        });
                        ops.push(addOps);
                    }

                    if ((position.votes_yes_percent != null)  && (position.votes_yes_percent != "")) {
                        [propertyId, choiceId] = await getPropertyInfo("position", "Votes yes (percent)", null, client)
                        addOps = Triple.make({
                            entityId: positionRelationId,
                            attributeId: propertyId,
                            value: {
                                type: "NUMBER",
                                value: position.votes_yes_percent.toString(),
                            },
                        });
                        ops.push(addOps);
                    }

                    if ((position.votes_no_percent != null)  && (position.votes_no_percent != "")) {
                        [propertyId, choiceId] = await getPropertyInfo("position", "Votes no (percent)", null, client)
                        addOps = Triple.make({
                            entityId: positionRelationId,
                            attributeId: propertyId,
                            value: {
                                type: "NUMBER",
                                value: position.votes_no_percent.toString(),
                            },
                        });
                        ops.push(addOps);
                    }   

                    addOps = await addSources(position, positionRelationId, client);
                    ops.push(...addOps);

                    if (false) {

                        // Once you have the ops you can publish them to IPFS and your space.
                    	const txHash = await publish({
                    		spaceId,
                    		author: walletAddress,
                    		editName: `Add Positions to ${input_person_id}`,
                    		ops: ops, // An edit accepts an array of Ops
                    	});
                    
                    	console.log("Your transaction hash is:", txHash);
                    }
                        
                    // Update the person with the new geo_id
                    await client.query('UPDATE people_db_position SET geo_id = $1 WHERE id = $2', [positionRelationId, position.id]);
                    await client.query('UPDATE people_db_position SET edited = $1 WHERE id = $2', [true, position.id]);
                    console.log(`Updated position ID ${position.id} with geo_id ${positionRelationId}`);
                    
                }
            } else {
                console.log(`Position already exists with Geo ID: ${position.geo_id}`);
            }
        }
        const invalidOperations = findInvalidOperations(ops);
        if (invalidOperations.length > 0) {
            console.error(`INVALID OPERATIONS PRODUCED IN FUCTION POSITION -- WHILE PROCESSING ID ${input_person_id}`)
        }
        
        return ops;
    } catch (err) {
        console.error('Error updating position:', err);
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
