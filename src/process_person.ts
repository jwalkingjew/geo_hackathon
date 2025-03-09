//Lots of good information here: https://github.com/freelawproject/courtlistener/blob/main/cl/people_db/models.py
import * as fs from 'fs';
import { Client } from 'pg';
import { Id, Ipfs, SystemIds, Relation, Triple, DataBlock, Position, PositionRange } from "@graphprotocol/grc-20";
import { Graph } from "@graphprotocol/grc-20";
import { deploySpace } from "./deploy-space";
import { publish } from "./publish";
import { format, parse } from "date-fns";
import { processPositions } from "./process_position";
import path from 'path';

async function getJudgePicAndSource(personId): [string, string] {
    let filepath;
    let source;

    interface PersonEntry {
      artist: string | null;
      date_created: string | null;
      hash: string;
      license: string;
      path: string;
      person: number;
      source: string;
    }
    
    function getPersonData(personId: number, filePath: string): { path: string; source: string } | null {
      try {
        const data = fs.readFileSync(filePath, 'utf-8'); // Read JSON file
        const jsonData: PersonEntry[] = JSON.parse(data); // Parse JSON into an array of objects
    
        const entry = jsonData.find((item) => item.person === personId); // Find matching person ID
    
        return entry ? { path: entry.path, source: entry.source } : null; // Return path & source if found
      } catch (error) {
        console.error("Error reading JSON file:", error);
        return null;
      }
    }

    const dir_in = "../judge-pics/judge_pics/data/" //TODO - UPDATE IMAGE DIRECTORY HERE
    const pic_dir = "orig/";
    let jsonPath = "people.json"; // Path to your JSON file
    
    const personData = getPersonData(personId, dir_in + jsonPath);

    if (personData != null) {

        filepath = dir_in + pic_dir + personData.path + ".jpeg";
        source = personData.source
    
        return [filepath, source]
    } else {
        return [null, null]
    }

}

const nonJudgePositionTypes: string[] = ["att-gen", "att-gen-ass", "att-gen-ass-spec", "sen-counsel", "dep-sol-gen", "pres", "gov", "mayor", "clerk", "clerk-chief-dep", "staff-atty", "prof", "adj-prof", "prac", "pros", "pub-def", "da", "ada", "legis", "sen", "state-sen"]

const judgePositionNames: string[] = ["Vice Chief Judge", "Trial Judge", "Reserve Judge", "Special Trial Judge", "Special Superior Court Judge for Complex Business Cases", "Special Judge", "Special Chairman", "Magistrate (Part-Time)", "Magistrate (Recalled)", "Magistrate Pro Tem", "Presiding Magistrate", "Chief Magistrate", "Magistrate", "Senior Judge", "Retired Justice", "Retired Chief Judge", "Retired Associate Judge", "Active Retired Justice", "State Trial Referee", "Official Referee", "Judge Trial Referee", "Justice Pro Tem", "Judge Pro Tem", "Deputy Commissioner", "Commissioner", "Supervising Judge", "Presiding Justice", "Presiding Judge", "Chief Special Trial Judge", "Chief Administrative Justice", "Chief Special Master", "Chief Justice", "Chief Judge", "Associate Presiding Judge", "Assistant Presiding Judge", "Associate Chief Judge", "Associate Justice", "Associate Judge", "Administrative Presiding Justice", "Acting Chief Administrative Justice", "Acting Presiding Judge", "Acting Justice", "Acting Judge", "Administrative Law Judge", "Justice", "Judge"]

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

function politicalPartySource(source: string): string | null{
    if (!source) return null; // Handle missing date
    switch (source.toLowerCase()) {
        case "b": return "Ballot"
        case "a": return "Appointer"
        case "o": return "Other"
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
                        format: "MMMM d, yyyy",
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

async function addDataBlockToJudge(judgeEntity, client): Array<Op> {
    const ops: Array<Op> = [];    
    let addOps;

    //const testSpaceId = "YRPckind3wVHcowVvbfx5X";
    const usLawSpaceId = "Q5YFEacgaHtXE9Kub9AEkA";
    let propertyId;
    let choiceId;
    //CREATE THE DATA BLOCK
    let blockOps = DataBlock.make({
        fromId: judgeEntity,
        sourceType: 'QUERY',
        name: "Opinions",
        position: PositionRange.FIRST
    });
    ops.push(...blockOps);
    
    //console.log(blockOps)
    let blockId = blockOps[2].relation.toEntity
    let blockRelationId = blockOps[2].relation.id

    //SET THE FILTERS FOR THE DATA BLOCK
    
    let opinionTypeId = await getTypeInfo("Opinion", client);
    [propertyId, choiceId] = await getPropertyInfo("opinion", "Authors", null, client)
    let filter = `{"where":{"AND":[{"spaces":["${usLawSpaceId}"],"attribute":"${SystemIds.TYPES_PROPERTY}","is":"${opinionTypeId}"},{"attribute":"${propertyId}","is":"${judgeEntity}"}]}}`
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

    let columns_list = ["Opinion type", "Opinion group"];
    for (const col of columns_list) {
        [propertyId, choiceId] = await getPropertyInfo("opinion", col, null, client)
        addOps = Relation.make({
            fromId: blockRelationId,
            toId: propertyId,
            relationTypeId: SystemIds.SHOWN_COLUMNS,
        });
        ops.push(addOps);
    }
    return ops;
}


async function addSources(person, newGeoId, client, include_fjc: boolean = true): Array<Op> {
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
        ops.push(addOps);

        if (person.id != null) {
            [propertyId, choiceId] = await getPropertyInfo("source", "Database identifier", null, client);
            addOps = Triple.make({
                entityId: relationId,
                attributeId: propertyId,
                value: {
                    type: "TEXT",
                    value: person.id.toString(),
                },
            });
            ops.push(addOps);

            addOps = Triple.make({
                entityId: relationId,
                attributeId: SystemIds.DESCRIPTION_PROPERTY,
                value: {
                    type: "TEXT",
                    value: "Person",
                },
            });
            ops.push(addOps);
        
            if ((person.slug != null) && (person.slug != "")) {
                addOps = Triple.make({
                    entityId: relationId,
                    attributeId: webURLPropertyId,
                    value: {
                        type: "URL",
                        value: `https://www.courtlistener.com/person/${person.id.toString()}/${person.slug}`,
                    },
                });
                ops.push(addOps);
            }
        }
    }

    if (include_fjc) {
        if (person.fjc_id != null) {
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
                        value: person.fjc_id.toString(),
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

const defaultJudgeImageId = "9JnoWcjFpLrU4M5dGTMsoQ";
const defaultFemaleJudgeImageId = "VWjhuB2LuScMgykGmNDZbp";

const endTimePropertyId = "R7X9rnVW49g29XvK5KMTtP";
const startTimePropertyId = "6cF7TMDBFwSt5vMENU3Cta"

const webURLPropertyId = "93stf6cgYvBsdPruRzq1KK"
const databaseIdPropertyId = "2XaDUAbys7eBAMR168vw9L"

export async function processPerson(inputId, client): [Array<Op>, string] {
    try {
        console.log("BEGIN PERSON")
        const ops: Array<Op> = [];
        let addOps;
        
        const res = await client.query(`
            SELECT 
                p.*, 
                r.race, 
                pa.political_party, 
                pa.source AS pp_source, 
                pa.date_start AS pp_date_start, 
                pa.date_granularity_start AS pp_date_granularity_start, 
                pa.date_end AS pp_date_end, 
                pa.date_granularity_end AS pp_date_granularity_end
            FROM people_db_person p
            LEFT JOIN people_db_person_race pr ON p.id = pr.person_id
            LEFT JOIN people_db_race r ON pr.race_id = r.id
            LEFT JOIN people_db_politicalaffiliation pa ON p.id = pa.person_id
            WHERE p.id = $1
        `, [inputId]);

        const people = res.rows;

        // Iterate through each person and update with a new geo_id
        for (const person of people) {
            //Error handle for when the observation has an alias
            let aliasRes;
            if (person.is_alias_of_id) {
                aliasRes = await client.query(`
                    SELECT 
                        p.*, 
                        r.race, 
                        pa.political_party, 
                        pa.source AS pp_source, 
                        pa.date_start AS pp_date_start, 
                        pa.date_granularity_start AS pp_date_granularity_start, 
                        pa.date_end AS pp_date_end, 
                        pa.date_granularity_end AS pp_date_granularity_end
                    FROM people_db_person p
                    LEFT JOIN people_db_person_race pr ON p.id = pr.person_id
                    LEFT JOIN people_db_race r ON pr.race_id = r.id
                    LEFT JOIN people_db_politicalaffiliation pa ON p.id = pa.person_id
                    WHERE p.id = $1
                `, [person.is_alias_of_id]);
            } else {
                aliasRes = await client.query(`
                    SELECT 
                        p.*, 
                        r.race, 
                        pa.political_party, 
                        pa.source AS pp_source, 
                        pa.date_start AS pp_date_start, 
                        pa.date_granularity_start AS pp_date_granularity_start, 
                        pa.date_end AS pp_date_end, 
                        pa.date_granularity_end AS pp_date_granularity_end
                    FROM people_db_person p
                    LEFT JOIN people_db_person_race pr ON p.id = pr.person_id
                    LEFT JOIN people_db_race r ON pr.race_id = r.id
                    LEFT JOIN people_db_politicalaffiliation pa ON p.id = pa.person_id
                    WHERE p.is_alias_of_id = $1
                `, [person.id]);
            }
        
            const aliases = aliasRes.rows;

            if (aliases.length > 0) {
                for (const alias of aliases) {
                    // Fill null values from alias data
                    for (const key in person) {
                        if ((person[key] == null || person[key] == "") && alias[key] != null && alias[key] != "") {
                            person[key] = alias[key];
                        }
                    }
                }
            }
            
            if (!person.geo_id){
                let propertyId;
                let choiceId;
                let typeId;
                let relationId;
                

                
                
                console.log(`\n------\nNEW PERSON\n------\n`);
                //Create New Judge
                const fullName = [person.name_first, 
                                  person.name_middle, 
                                  person.name_last, 
                                  outputSuffix(person.name_suffix)
                                 ].filter(Boolean).join(' '); // Construct full name, filtering NAs
                console.log(`Judge Name: ${fullName}`); 

                const [genderPropertyId, genderId] = await getPropertyInfo("judge", "Gender", person.gender, client)
                const [religionPropertyId, religionId] = await getPropertyInfo("judge", "Religion", person.religion, client)
                const [ethnicityPropertyId, ethnicityId] = await getPropertyInfo("judge", "Ethnicity", person.race, client)

                //const properties: Record<string, any> = {};
//
                //if (genderId) properties[genderPropertyId] = { to: genderId };
                //if (religionId) properties[religionPropertyId] = { to: religionId };
                //if (ethnicityId) properties[ethnicityPropertyId] = { to: ethnicityId };
                
                const { id: newGeoId, ops: createPersonOps } = Graph.createEntity({
                    name: fullName,
                    types: [SystemIds.PERSON_TYPE],
//                    properties,
                });
                ops.push(...createPersonOps);

                if (genderId) {
                    addOps = Relation.make({
                        fromId: newGeoId,
                        toId: genderId,
                        relationTypeId: genderPropertyId,
                    });
                    ops.push(addOps);

                    relationId = addOps.relation.id;
                    addOps = await addSources(person, relationId, client);
                    ops.push(...addOps);
                }

                if (religionId) {
                    addOps = Relation.make({
                        fromId: newGeoId,
                        toId: religionId,
                        relationTypeId: religionPropertyId,
                    });
                    ops.push(addOps);

                    relationId = addOps.relation.id;
                    addOps = await addSources(person, relationId, client, false);
                    ops.push(...addOps);
                }

                if (ethnicityId) {
                    addOps = Relation.make({
                        fromId: newGeoId,
                        toId: ethnicityId,
                        relationTypeId: ethnicityPropertyId,
                    });
                    ops.push(addOps);

                    relationId = addOps.relation.id;
                    addOps = await addSources(person, relationId, client);
                    ops.push(...addOps);
                }




                let flag = false;
                const judgeRes = await client.query(`
                    SELECT 
                        *
                    FROM people_db_position
                    WHERE person_id = $1
                    AND position_type IS NOT NULL AND position_type <> ''
                    AND court_id IS NOT NULL AND court_id <> ''
                    AND (position_type NOT IN ($2) OR job_title IN ($3))
                `, [person.id, nonJudgePositionTypes, judgePositionNames]);

                if (judgeRes.rows.length > 0) {
                    addOps = Relation.make({
                        fromId: newGeoId,
                        toId: await getTypeInfo("Judge", client),
                        relationTypeId: SystemIds.TYPES_PROPERTY,
                    });
                    ops.push(addOps);

                    addOps = await addDataBlockToJudge(newGeoId, client)
                    ops.push(...addOps)

                    flag = true
                }
                //FOR WHEN I CAN UPLOAD IMAGES
                const [filepath, source] = await getJudgePicAndSource(person.id)
                if (filepath != null) {
                    // create an image
                    const { id: imageId, ops: createImageOps } = await Graph.createImage({
                      //url: 'https://example.com/image.png',
                       blob: new Blob([fs.readFileSync(path.join(filepath))], { type: 'image/jpeg' })
                    });
            
                    ops.push(...createImageOps)
            
                    addOps = Relation.make({
                        fromId: newGeoId,
                        toId: imageId,
                        relationTypeId: "399xP4sGWSoepxeEnp3UdR", //AVATAR_PROPERTY
                    });
                    ops.push(addOps);
                } else if ((flag) && (person.gender == "f" ) && (defaultFemaleJudgeImageId != "")) {
                    addOps = Relation.make({
                        fromId: newGeoId,
                        toId: defaultFemaleJudgeImageId,
                        relationTypeId: "399xP4sGWSoepxeEnp3UdR", //AVATAR_PROPERTY
                    });
                    ops.push(addOps);
                } else if ((flag) && (defaultJudgeImageId!= "")) {
                    addOps = Relation.make({
                        fromId: newGeoId,
                        toId: defaultJudgeImageId,
                        relationTypeId: "399xP4sGWSoepxeEnp3UdR", //AVATAR_PROPERTY
                    });
                    ops.push(addOps);
                }


                
               

                if ((person.date_dob != null) && (person.date_dob != "")) {
                    [propertyId, choiceId] = await getPropertyInfo("judge", "Date of birth", null, client)
                    if (propertyId != null) {
                        addOps = postDate(newGeoId, propertyId, person.date_dob, person.date_granularity_dob)
                        ops.push(addOps);
                    }
                }
                
                if ((person.date_dod != null) && (person.date_dod != "")) {
                    [propertyId, choiceId] = await getPropertyInfo("judge", "Date of death", null, client)
                    addOps = postDate(newGeoId, propertyId, person.date_dod, person.date_granularity_dod)
                }
                
                if ((person.political_party != null) && (person.political_party != "")) {
                    [propertyId, choiceId] = await getPropertyInfo("judge", "Political affiliation", person.political_party, client)
                    //Create Political Affiliation Relation
                    addOps = Relation.make({
                		fromId: newGeoId,
                		toId: choiceId,
                		relationTypeId: propertyId, // Political Affiliation Property ID
                	});
                    relationId = addOps.relation.id;
                    ops.push(addOps);

                    
                    if ((person.pp_source != null) && (person.pp_source != "")) {
                        [propertyId, choiceId] = await getPropertyInfo("source", "Political party source", person.pp_source, client)
                        if (choiceId != null) {
                            addOps = Relation.make({
                        		fromId: relationId,
                        		toId: choiceId,
                        		relationTypeId: propertyId, 
                        	});
                            ops.push(addOps)
                        }
                    }
    
                    if ((person.pp_date_start != null) && (person.pp_date_start != "")) {
                        //if not null, set start date
                        addOps = postDate(relationId, startTimePropertyId, person.pp_date_start,person.pp_date_granularity_start)
                        ops.push(addOps);
                    }
                    if ((person.pp_date_end != null) && (person.pp_date_end != "")) {
                        //if not null, set start date
                        addOps = postDate(relationId, endTimePropertyId, person.pp_date_end,person.pp_date_granularity_end)
                        ops.push(addOps);
                    }
                    addOps = await addSources(person, relationId, client);
                    ops.push(...addOps);
                }

                addOps = await addSources(person, newGeoId, client);
                ops.push(...addOps);
                
                
                if (false) {
                	// Once you have the ops you can publish them to IPFS and your space.
                	const txHash = await publish({
                		spaceId,
                		author: walletAddress,
                		editName: `Add person ${fullName}`,
                		ops: ops, // An edit accepts an array of Ops
                	});
                
                	console.log("Your transaction hash is:", txHash);
                }
                
                // Update the person with the new geo_id
                await client.query('UPDATE people_db_person SET geo_id = $1 WHERE id = $2', [newGeoId, person.id]);
                await client.query('UPDATE people_db_person SET edited = $1 WHERE id = $2', [true, person.id]);
                console.log(`Updated person ID ${person.id} with geo_id ${newGeoId}`);
                
                addOps = await processPositions(person.id, client);
                ops.push(...addOps);
                
                return [ops, newGeoId];
            } else {
                console.log(`${person.name_first} ${person.name_last} already exists with Geo ID: ${person.geo_id}`);
                addOps = await processPositions(person.id, client);
                ops.push(...addOps);
                
                return [ops, person.geo_id];
            }
        }
    } catch (err) {
        console.error('Error updating people:', err);
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








            
            //EVERYTHING BELOW HAS NOT BEEN HANDLED YET!!!
            
            // If they have a photo it would be good to snag it... Need to figure that out.
            // const hasPhoto = person.has_photo; //Whether there is a photo corresponding to this person in the judge pics project.
            
            //const dobCity = person.dob_city; //The city where the person was born
            //const dobState = person.dob_state; //The state where the person was born
            //const dobCountry = person.dob_country; //The country where the person was born
            //const dodCity = person.dod_city; //The city where the person died.
            //const dodState = person.dod_state; //The state where the person died.
            //const dodCountry = person.dod_country; //The country where the person died.
            //console.log(`Location of Birth: ${dobCity} ${dobState} ${dobCountry}`);
            //console.log(`Location of Death: ${dodCity} ${dodState} ${dodCountry}`);
//
//
            ////Not sure how to use these or if I want to...
            //const ftmTotalReceived = person.ftm_total_received; //The amount of money received by this person and logged by Follow the Money.
            //const ftmEID = person.ftm_eid; //The ID of a judge as assigned by the Follow the Money
            //const fjcId = person.fjc_id; //The ID of a judge as assigned by the Federal Judicial 
            //const clSlug = person.slug; //A generated path for this item as used in CourtListener URLs
            //const clId = person.id; //A generated path for this item as used in CourtListener URLs
//
            //console.log(`\nUnknown Outputs`);
            //console.log(`ftmTotalReceived: ${ftmTotalReceived}`); 
            //console.log(`ftmEID: ${ftmEID}`); 
            //console.log(`fjcId: ${fjcId}`);
            //console.log(`clSlug: ${clSlug}`);
            //console.log(`clId: ${clId}`);