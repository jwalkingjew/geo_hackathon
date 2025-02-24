//Lots of good information here: https://github.com/freelawproject/courtlistener/blob/main/cl/people_db/models.py

import { Client } from 'pg';
import { Id, Ipfs, SystemIds, Relation, Triple } from "@graphprotocol/grc-20";
import { Graph } from "@graphprotocol/grc-20";
import { deploySpace } from "./src/deploy-space";
import { publish } from "./src/publish";
import { format, parse } from "date-fns";

// PostgreSQL connection details
const client = new Client({
    host: 'localhost', // e.g., 'localhost'
    port: 5432, // Default port
    user: 'postgres',
    password: '',
    database: 'courtlistener',
});

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

function outputReligion(religion: string): string | null{
    if (!religion) return null; // Handle missing date
    switch (religion.toLowerCase()) {
        case "ca": return "Catholic";
        case "pr": return "Protestant";
        case "je": return "Jewish";
        case "mu": return "Muslim";
        case "at": return "Atheist";
        case "ag": return "Agnostic";
        case "mo": return "Mormon";
        case "bu": return "Buddhist";
        case "hi": return "Hindu";
        case "ep": return "Episcopalian";
        case "ro": return "Roman Catholic";
        case "me": return "Methodist";
        case "pe": return "Presbyterian";
        case "un": return "Unitarian";
        default:
            return null;
    }
}

function outputReligionId(religion: string): string | null{
    if (!religion) return null; // Handle missing date
    switch (religion.toLowerCase()) {
        case "ca": return "E1CRCXScjRXavRqTyzKXP2";
        case "catholic": return "E1CRCXScjRXavRqTyzKXP2";
        case "pr": return "55KiSBHEYebDQ7h27vPDCT";
        case "protestant": return "55KiSBHEYebDQ7h27vPDCT";
        case "je": return "DMHNwVjFPc7wU1M6XuciSu";
        case "jewish": return "DMHNwVjFPc7wU1M6XuciSu";
        case "mu": return "Kp4f6iqFbKBfCtrT2UL35u";
        case "muslim": return "Kp4f6iqFbKBfCtrT2UL35u";
        case "at": return "9h4Eh1eouMq3sr6cEyFuyE";
        case "atheist": return "9h4Eh1eouMq3sr6cEyFuyE";
        case "ag": return "BLujbx9jA7nqZgVbGRK66h";
        case "agnostic": return "BLujbx9jA7nqZgVbGRK66h";
        case "mo": return "5KMJ2N8xWbhgMHE9P7hov1";
        case "mormon": return "5KMJ2N8xWbhgMHE9P7hov1";
        case "bu": return "GeKJa5TK2E5MwsJb4GgouJ";
        case "buddhist": return "GeKJa5TK2E5MwsJb4GgouJ";
        case "hi": return "TVLcHSMPVDMd5rzw4Jokgd";
        case "hindu": return "TVLcHSMPVDMd5rzw4Jokgd";
        case "ep": return "S9b5u3RVVvF3WdQjmA5iJ3";
        case "episcopalian": return "S9b5u3RVVvF3WdQjmA5iJ3";
        case "ro": return "NuogHhdC81atZR3P2Qsoib";
        case "roman catholic": return "NuogHhdC81atZR3P2Qsoib";
        case "me": return "6znPpLkZVoeYnvZLJDRF5w";
        case "methodist": return "6znPpLkZVoeYnvZLJDRF5w";
        case "pe": return "D8T1ZtRaHreiHStLhWfHvN";
        case "presbyterian": return "D8T1ZtRaHreiHStLhWfHvN";
        case "un": return "TwRQr5ytr95ewVBH74VPQU";
        case "unitarian": return "TwRQr5ytr95ewVBH74VPQU";
        case "c": return "778rCwNTpea783pvaGfYWJ";
        case "congregationalist": return "778rCwNTpea783pvaGfYWJ";
        case "rd": return "GXUxbxWLeximSrxPrWqDnw";
        case "reformed dutch": return "GXUxbxWLeximSrxPrWqDnw";
        case "b": return "XHWmDt66NN3GSPyWUrdTCD";
        case "baptist": return "XHWmDt66NN3GSPyWUrdTCD";
        case "q": return "MGdE5sR8vb8nRmkE6gtdga";
        case "quaker": return "MGdE5sR8vb8nRmkE6gtdga";
        case "dc": return "BqYZ5hRyXkaDRknApjj9xd";
        case "disciples of christ": return "BqYZ5hRyXkaDRknApjj9xd";
        case "sb": return "UckxiLzdo9koEN1FD2TUJf";
        case "southern baptist": return "UckxiLzdo9koEN1FD2TUJf";
        case "d": return "Le9uxtwE9JAzZ1T17dTkxy";
        case "deist": return "Le9uxtwE9JAzZ1T17dTkxy";
        default:
            return null;
    }
}

function outputRaceName(race: string): string | null{
    if (!race) return null; // Handle missing date
    switch (race.toLowerCase()) {
        case "w": return "White";
        case "b": return "Black or African American";
        case "i": return "American Indian or Alaska Native";
        case "a": return "Asian";
        case "p": return "Native Hawaiian or Other Pacific Islander";
        case "h": return "Hispanic/Latino";
        case "mena": return "Middle Eastern/North African";
        case "o": return null; //Other
        default:
            return null;
    }
}

function outputRaceId(race: string): string | null{
    if (!race) return null; // Handle missing date
    switch (race.toLowerCase()) {
        case "w": return "XDwNjYiBp8dPa6BDTf8wZk";
        case "b": return "GwShg7xsNcdUWLmRUVvb54";
        case "i": return "6XxTmErGdbguWuJp95s62w";
        case "a": return "7xXUvuc2r3vqjkyXihr2fZ";
        case "p": return "6AXNgbwReQpJqRy1C73fa5";
        case "h": return "8ohFEWT5bAqxrfLzzaajoZ";
        case "mena": return "RdpAHUNQSxjA9WAaJUQbQJ";
        case "o": return null;
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

function politicalPartyName(party: string): string | null{
    if (!party) return null; // Handle missing date
    switch (party.toLowerCase()) {
        case "d": return "Democratic"
        case "r": return "Republican"
        case "i": return "Independent"
        case "g": return "Green"
        case "l": return "Libertarian"
        case "f": return "Federalist"
        case "w": return "Whig"
        case "j": return "Jeffersonian Republican"
        case "u": return "National Union"
        case "z": return "Reform Party"
        default:
            return null;
    }
}

function politicalPartyId(party: string): string | null{
    if (!party) return null; // Handle missing date
    switch (party.toLowerCase()) {
        case "d": return "EJr6TvU2DfcX98bV8NHBki"
        case "r": return "7BJ5Phu1aQggsKyoPM4Efd"
        case "i": return "R2159MrTDvZQzT1SEfdaQY"
        case "g": return "8DqjQmYrcTvKFchAxQnXio"
        case "l": return "FM3NnHQP8tL5b69dmfYtDj"
        case "f": return "Lq87U59uoEEVCJ7HQ94Tr2"
        case "w": return "H4TNNDQWGM55ogK4Nqivzw"
        case "j": return "2iLJhCHK7GDwjyDe2UXHWd"
        case "u": return "6gdsyP6muTLgNQmZMaRTmw"
        case "z": return "DeVZexWPfXRAcQCCtbVbxW"
        default:
            return null;
    }
}

function outputGender(gender: string): string | null{
    if (!gender) return null; // Handle missing date
    switch (gender.toLowerCase()) {
        case "m":
        case "male":
            return "Male"; //Male Gender Type ID
        case "f":
        case "female":
            return "Female"; //Female Gender Type ID
        case "o":
        case "other_gender":
        case "other":
            return null;
        default:
            return null;
    }
}

function getDateFormat(format: string): string | null{
    if (!format) return null; // Handle missing format
    switch (format) {
        case "%Y": return "yyyy"; // Year only
        case "%Y-%m": return "MMMM yyyy"; // Month and year
        case "%Y-%m-%d": return "MMMM do, yyyy"; // Full date
        default:
            return null;
    }
}

function outputGenderId(gender: string): string | null{
    if (!gender) return null; // Handle missing date
    switch (gender.toLowerCase()) {
        case "m":
        case "male":
            return "MNnscvpaDaAQNvPWcDSHHN"; //Male Gender Type ID
        case "f":
        case "female":
            return "A28AuXa4WVUXkuMANkMjk2"; //Female Gender Type ID
        case "o":
        case "other_gender":
        case "other":
            return null;
        default:
            return null;
    }
}


// DEFINE NECESSARY CONSTANTS
const spaceId = "EzQsF1VvvPV5FVqcp6YTtt";

const endTimePropertyId = "R7X9rnVW49g29XvK5KMTtP";
const startTimePropertyId = "6cF7TMDBFwSt5vMENU3Cta"

const genderPropertyId = "5TfoSkkYjRLWeFo7JY8L4v";
const religionPropertyId = "BQ8qULbc1jPMPxmLZzG4WE";
const racePropertyId = "U63bdnHPEi5SW16MVSNGTW";
const politicalPartyPropertyId = "Wwjdxo6vQRRK7ttEVtjBE4";

const dobPropertyId = "3QdZ7QrPPGhvf6uMp7jAQi";
const dodPropertyId = "MZG6NbE8Ep5SDgZcnDQPFX";

async function processPerson() {
    try {
        // Connect to the database
        await client.connect();
        console.log('Connected to the database');

        //Query to select all people
        //const res = await client.query('SELECT id FROM people_db_person');
        //const res = await client.query('SELECT * FROM people_db_person where id = 1213');
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
            WHERE p.id = 1213
        `);

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
                        if ((person[key] === null || person[key] === "") && alias[key] !== null && alias[key] !== "") {
                            person[key] = alias[key];
                        }
                    }
                }
            }
            
            if (!person.geo_id){

                const ops: Array<Op> = [];
    
                console.log(`\n------\nNEWJUDGE\n------\n`);
                //Create New Judge
                
                console.log(`\nTriples Outputs`); //Triples
                const fullName = [person.name_first, 
                                  person.name_middle, 
                                  person.name_last, 
                                  person.name_suffix
                                 ].filter(Boolean).join(' '); // Construct full name, filtering NAs
                console.log(`Judge Name: ${fullName}`); 
    
                // Relations
                console.log(`\nRelations Outputs`);
                const gender = person.gender; //The person's gender
                console.log(`Judge Gender: ${outputGender(gender)}`); 
                const religion = person.religion; //The religion of a person
                console.log(`Religion: ${religion}`); 
                const race = person.race; //The religion of a person
                console.log(`Race: ${race}`);  //Need to create an output religion switch function as well
                const party = person.political_party; //The religion of a person

                let dateOfBirth = null
                let dobFormat = null
                let dateOfDeath = null
                let dodFormat = null
                if (person.date_dob !== null) {
                    dateOfBirth = person.date_dob.toISOString().split("T")[0] + "T00:00:00.000Z" //The date of birth for the person
                    dobFormat = getDateFormat(person.date_granularity_dob)
                }
                if (person.date_dob !== null) {
                    dateOfDeath = person.date_dod.toISOString().split("T")[0] + "T00:00:00.000Z" //The date of birth for the person
                    dodFormat = getDateFormat(person.date_granularity_dod)
                }

                console.log(`Date of Birth: ${dateOfBirth}`);
                console.log(`Date of Death: ${dateOfDeath}`);
                
                const { id: newGeoId, ops: createPersonOps } = Graph.createEntity({
                    name: fullName,
                    types: [SystemIds.PERSON_TYPE],
                    properties: {
                        [dobPropertyId]: {
                            type: 'TIME',
                            value: dateOfBirth,
                            options: {
                                format: dobFormat
                            }
                        },
                        [dodPropertyId]: {
                            type: 'TIME',
                            value: dateOfDeath,
                            options: {
                                format: dodFormat
                            }
                        },
                        [genderPropertyId]: { // Gender Property ID
                            to: outputGenderId(gender),
                        },
                        [religionPropertyId]: { // Religion Property ID
                            to: outputReligionId(religion),
                        },
                        [racePropertyId]: { // Race Property ID
                            to: outputRaceId(race),
                        },
                    },
                });
                ops.push(...createPersonOps);

                
                console.log(`Political Party: ${party}`);
                console.log(`Political Source: ${politicalPartySource(person.pp_source)}`);
                console.log(`Political Start: ${person.pp_date_start.toISOString().split("T")[0] + "T00:00:00.000Z"}`);
                console.log(`Political End: ${person.pp_date_end.toISOString().split("T")[0] + "T00:00:00.000Z"}`);
                if (politicalPartyId(party) !== null) {
                    //Create Political Affiliation Relation
                    const typeRelation = Relation.make({
                		fromId: newGeoId,
                		toId: politicalPartyId(party),
                		relationTypeId: politicalPartyPropertyId, // Political Affiliation Property ID
                	});
                    const politicalAffiliationRelationId = typeRelation.relation.id;
                    ops.push(typeRelation)
    
                    if (politicalPartySource(person.pp_source) !== null) {
                        const nameTriple = Triple.make({
                    		entityId: politicalAffiliationRelationId,
                            attributeId: SystemIds.DATA_SOURCE_PROPERTY,
                    		value: {
                    			type: "TEXT",
                    			value: politicalPartySource(person.pp_source),
                    		},
                    	});
                        ops.push(nameTriple)
                    }
    
                    if (person.pp_date_start !== null) {
                        //if not null, set start date
                        const startDateTriple = Triple.make({
                            entityId: politicalAffiliationRelationId,
                            attributeId: startTimePropertyId,
                            value: {
                                type: "TIME",
                                value: person.pp_date_start.toISOString().split("T")[0] + "T00:00:00.000Z",
                                options: {
                                    format: getDateFormat(person.pp_date_granularity_start)
                                }
                            },
                        });
                        ops.push(startDateTriple);
                    }
                    if (person.pp_date_end !== null) {
                        //if not null, set start date
                        const endDateTriple = Triple.make({
                            entityId: politicalAffiliationRelationId,
                            attributeId: endTimePropertyId,
                            value: {
                                type: "TIME",
                                value: person.pp_date_end.toISOString().split("T")[0] + "T00:00:00.000Z",
                                options: {
                                    format: getDateFormat(person.pp_date_granularity_end)
                                }
                            },
                        });
                        ops.push(endDateTriple);
                    }
                }

            	// Once you have the ops you can publish them to IPFS and your space.
            	const txHash = await publish({
            		spaceId,
            		author: "0x84713663033dC5ba5699280728545df11e76BCC1",
            		editName: "Update courts",
            		ops: ops, // An edit accepts an array of Ops
            	});
            
            	console.log("Your transaction hash is:", txHash);
                
                // Update the person with the new geo_id
                await client.query('UPDATE people_db_person SET geo_id = $1 WHERE id = $2', [newGeoId, person.id]);
                console.log(`Updated person ID ${person.id} with geo_id ${newGeoId}`);
            } else {
                console.log(`Person already exists with Geo ID: ${person.geo_id}`);
            }
            

            
            //EVERYTHING BELOW HAS NOT BEEN HANDLED YET!!!
            
            // If they have a photo it would be good to snag it... Need to figure that out.
            // const hasPhoto = person.has_photo; //Whether there is a photo corresponding to this person in the judge pics project.
            
            const dobCity = person.dob_city; //The city where the person was born
            const dobState = person.dob_state; //The state where the person was born
            const dobCountry = person.dob_country; //The country where the person was born
            const dodCity = person.dod_city; //The city where the person died.
            const dodState = person.dod_state; //The state where the person died.
            const dodCountry = person.dod_country; //The country where the person died.
            console.log(`Location of Birth: ${dobCity} ${dobState} ${dobCountry}`);
            console.log(`Location of Death: ${dodCity} ${dodState} ${dodCountry}`);


            //Not sure how to use these or if I want to...
            const ftmTotalReceived = person.ftm_total_received; //The amount of money received by this person and logged by Follow the Money.
            const ftmEID = person.ftm_eid; //The ID of a judge as assigned by the Follow the Money
            const fjcId = person.fjc_id; //The ID of a judge as assigned by the Federal Judicial 
            const clSlug = person.slug; //A generated path for this item as used in CourtListener URLs
            const clId = person.id; //A generated path for this item as used in CourtListener URLs

            console.log(`\nUnknown Outputs`);
            console.log(`ftmTotalReceived: ${ftmTotalReceived}`); 
            console.log(`ftmEID: ${ftmEID}`); 
            console.log(`fjcId: ${fjcId}`);
            console.log(`clSlug: ${clSlug}`);
            console.log(`clId: ${clId}`);
            
            
        }
    } catch (err) {
        console.error('Error updating people:', err);
    } finally {
        // Close the database connection
        await client.end();
        console.log('Database connection closed');
    }
}

// Run the function
processPerson();
