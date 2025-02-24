//Lots of good information here: https://github.com/freelawproject/courtlistener/blob/main/cl/people_db/models.py

import { Client } from 'pg';
import { Id, Ipfs, SystemIds, Relation, Triple } from "@graphprotocol/grc-20";
import { deploySpace } from "./src/deploy-space";
import { publish } from "./src/publish";
import { format, parse } from 'date-fns';

// PostgreSQL connection details
const client = new Client({
    host: 'localhost', // e.g., 'localhost'
    port: 5432, // Default port
    user: 'postgres',
    password: '',
    database: 'courtlistener',
});

function formatDate(date: string, dateGran: string): { dateFormat: string; date: string | null } {
    if (!date) return { dateFormat: "Unknown", date: null }; // Handle missing date

    try {
        // Parse date components manually to avoid timezone shifts
        //const [year, month, day] = date.split("-").map(Number);
        // Ensure the time is set to 00:00:00.000 in UTC
        //const parsedDate = new Date(Date.UTC(year, month - 1, day));
        const parsedDate = date;//new Date(date);
        if (isNaN(parsedDate.getTime())) {
            return { dateFormat: "Invalid Date", date: null };
        }  
        
        let dateFormat: string;

        switch (dateGran) {
            case "%Y":
                dateFormat = "yyyy"; // Year only
                break;
            case "%Y-%m":
                dateFormat = "MMMM yyyy"; // Month and year
                break;
            case "%Y-%m-%d":
                dateFormat = "MMMM do, yyyy"; // Full date
                break;
            default:
                return { dateFormat: "Invalid Granularity", date: null };
        }
        
        return { dateFormat: dateFormat, date: parsedDate.toISOString() };
    } catch (error) {
        return { dateFormat: "Err Invalid Date", date: null };
    }
}

function outputJurisdiction(jurisdiction: string): string | null{
    if (!jurisdiction) return null; // Handle missing date
    switch (jurisdiction) {
        case "F": return "Federal Appellate";
        case "FD": return "Federal District";
        case "FB": return "Federal Bankruptcy";
        case "FBP": return "Federal Bankruptcy Panel";
        case "FS": return "Federal Special";
        case "S": return "State Supreme";
        case "SA": return "State Appellate";
        case "ST": return "State Trial";
        case "SS": return "State Special";
        case "SAG": return "State Attorney General";
        case "TRS": return "Tribal Supreme";
        case "TRA": return "Tribal Appellate";
        case "TRT": return "Tribal Trial";
        case "TRX": return "Tribal Special";
        case "TS": return "Territory Supreme";
        case "TA": return "Territory Appellate";
        case "TT": return "Territory Trial";
        case "TSP": return "Territory Special";
        case "MA": return "Military Appellate";
        case "MT": return "Military Trial";
        case "C": return "Committee";
        case "I": return "International";
        case "T": return "Testing";
        default:
            return null;
    }
}

function outputJurisdictionIds(jurisdiction: string): string | null{
    if (!jurisdiction) return null; // Handle missing date
    switch (jurisdiction) {
        case "F": return "KcXF3wL7bu25nfgoNcsxu2";
        case "FD": return "2tGidaWDjXNHkUD36YdqP8";
        case "FB": return "R3nw76G1jw3heTCzXpL31f";
        case "FBP": return "KcgcJkaLN8WvfXffqedj4W";
        case "FS": return "NTdFCRqqiaedTUdHiLrorM";
        case "S": return "TqJpTinr9q5yqUGEMn9QNm";
        case "SA": return "L5pWd1Pa4s8m9RLEoUcr1D";
        case "ST": return "PQbqwJf8mUVa8CXpRUZihc";
        case "SS": return "TQBjL2Mh1EaLMk7ARap4gS";
        case "SAG": return "BF2zdVVpPZ36VBgtpFYRA9";
        case "TRS": return "EXYLJ7cPATjqK4NNU7BEdR";
        case "TRA": return "32USRQyNNzem48EcPRZ16D";
        case "TRT": return "FUMW2iFkPXgxDMSTdjK4GJ";
        case "TRX": return "FM9FfqnY2WFcJACiTpq3AY";
        case "TS": return "B8GMbbRcfs5Z3GgLAU8MpE";
        case "TA": return "Q9YSbKCUfZL7LFq8FFBPzp";
        case "TT": return "EhhUtQXwb73nLiZq6x8MYp";
        case "TSP": return "CK3FPFhGpf8EM6VaUGVuRg";
        case "MA": return "4ww7aYmnipXkGGKpqXzWDh";
        case "MT": return "Rx444hvXspfJu7p74Him6Y";
        case "C": return "Cw4zXmyt5QUidtKyuywEnx";
        case "I": return "DCDfFQcFifRtnVR7HhzznJ";
        case "T": return "LQYZycHq5ynyBd15W1ZzZk";
        default:
            return null;
    }
}




// DEFINE NECESSARY CONSTANTS
const spaceId = "EzQsF1VvvPV5FVqcp6YTtt";

async function updatePeopleWithGeoId() {
    try {
        // Connect to the database
        await client.connect();
        console.log('Connected to the database');

        // Query to select all people
        //const res = await client.query('SELECT id FROM people_db_person');
        const res = await client.query(`SELECT * FROM search_court where id in ('dcd')`);
        const courts = res.rows;

        if (courts.length > 0) {
            console.log("Column Titles:", Object.keys(courts[0])); // Logs all column names
        } else {
            console.log("No rows returned.");
        }

        // Iterate through each person and update with a new geo_id
        for (const court of courts) {
            let newGeoId: string; 
            
            if (!court.geo_id){
                newGeoId = Id.generate();
            } else {
                newGeoId = court.geo_id
            }

            //PropertyIds

            const websitePropertyId = "WVVjk5okbvLspwdY1iTmwp";
            const citPropertyId = "P8VNpBkKAXFLJi4xoYQRw5";
            const namePropertyId = SystemIds.NAME_ATTRIBUTE;
            const typesPropertyId = SystemIds.TYPES_ATTRIBUTE;
            const endTimePropertyId = "R7X9rnVW49g29XvK5KMTtP";
            const startTimePropertyId = "6cF7TMDBFwSt5vMENU3Cta"
            
            const courtEntityId = "9TELtkMoExNaSPKQEgNmnz";
            const propertiesRelId = "9zBADaYzyfzyFJn4GU1cC"
            const jurisdictionTypeyId = "HGNfam1iiNYkHuApiCGjvk";
            const jurisdictionPropertyId = "LpN6DJL7dmBNiyfZtDkyQk";
            
            
            console.log(`\n------\nNEWCOURT\n------\n`);

            //Triples
            const fullName = court.full_name;
            const shortName = court.short_name;
            const citationString = court.citation_string; // The citation abbreviation for the court as dictated by Blue Book
            const startDate = court.start_date;
            const endDate = court.end_date;
            const jurisdiction = outputJurisdiction(court.jurisdiction); //the jurisdiction of the court, one of
            const url = court.url; //the homepage for each court or the closest thing thereto
            const position = court.position; //A dewey-decimal-style numeral indicating a hierarchical ordering of jurisdictions
            const notes = court.notes; //any notes about coverage or anything else (currently very raw)
            const inUse = court.in_use; //Whether this jurisdiction is in use in CourtListener

            console.log(`\Important Outputs`);
            console.log(`fullName: ${fullName}`); 
            console.log(`citationString: ${citationString}`); 
            console.log(`startDate: ${startDate}`);
            console.log(`endDate: ${endDate}`);
            console.log(`jurisdiction: ${jurisdiction}`);
            console.log(`url: ${url}`);
            console.log(`position: ${position}`);
            
            const cl_id = court.id; // unique ID for each court as used in Courtlistener URLs
            const pacer_court_id = court.name_middle; //The numeric ID for the court in PACER. This can be found by looking at the first three digits of any doc1 URL in PACER."
            const fjc_court_id = court.name_last; //The ID used by FJC in the Integrated Database
            const parent_court_id = court.name_suffix; //Parent court for subdivisions

            console.log(`\n`);
            
            console.log(`\ID Outputs`);
            console.log(`cl_id: ${cl_id}`); 
            console.log(`pacer_court_id: ${pacer_court_id}`); 
            console.log(`fjc_court_id: ${fjc_court_id}`);
            console.log(`parent_court_id: ${parent_court_id}`);            

            //const namePropertyID = SYSTEM_IDS.NAME_ATTRIBUTE;
            //const rolesPropertyID = SYSTEM_IDS.ROLES_ATTRIBUTE;

            //Triples
            //const triples: { entityId: string; attributeId: string; value: { type: string; value: string } }[] = [];
            //const triplesAndRelations: (ReturnType<typeof Triple.make> | ReturnType<typeof Relation.make>)[] = [];
            const triplesAndRelations = [];
            
            //Create Entity and set the name
            const nameTriple = Triple.make({
        		entityId: newGeoId,
                attributeId: namePropertyId,
        		value: {
        			type: "TEXT",
        			value: fullName,
        		},
        	});
            triplesAndRelations.push(nameTriple);

            if (startDate !== null) {
                //if not null, set start date
                const startDateTriple = Triple.make({
                    entityId: newGeoId,
                    attributeId: startTimePropertyId,
                    value: {
                        type: "TIME",
                        value: startDate.toISOString().split("T")[0] + "T00:00:00.000Z",
                    },
                });
                triplesAndRelations.push(startDateTriple);
            }

            if (endDate !== null) {
                console.log("here")
                const endDateTriple = Triple.make({
                    entityId: newGeoId,
                    attributeId: endTimePropertyId,
                    value: {
                        type: "TIME",
                        value: endDate.toISOString().split("T")[0] + "T00:00:00.000Z",
                    },
                });
                triplesAndRelations.push(endDateTriple);
            }
            

            if (url !== null) {
                //if not null, set url
                const urlTriple = Triple.make({
            		entityId: newGeoId,
                    attributeId: wesitePropertyId,
            		value: {
            			type: "URL",
            			value: url,
            		},
            	});
                triplesAndRelations.push(urlTriple);
            }

            if (citationString !== null) {
                //if not null, set url
                const citTriple = Triple.make({
            		entityId: newGeoId,
                    attributeId: citPropertyId,
            		value: {
            			type: "TEXT",
            			value: citationString,
            		},
            	});
                triplesAndRelations.push(citTriple);
            }

            
            //set relation to court property
            const courtRelation = Relation.make({
        		fromId: newGeoId,
        		toId: courtEntityId,
        		relationTypeId: typesPropertyId,
        	});
            triplesAndRelations.push(courtRelation);

            if (jurisdiction !== null) {
                //if not null, relate to respective jurisdiction property
                const jurisRelation = Relation.make({
            		fromId: newGeoId,
            		toId: outputJurisdictionIds(court.jurisdiction), //SET THIS WITH THE APPROPRIATE JURISDICTION ID
            		relationTypeId: jurisdictionPropertyId,
            	});
                triplesAndRelations.push(jurisRelation);
            }

            if (!court.geo_id){
            	// Once you have the ops you can publish them to IPFS and your space.
            	const txHash = await publish({
            		spaceId,
            		author: "0x84713663033dC5ba5699280728545df11e76BCC1",
            		editName: "Update courts",
            		ops: triplesAndRelations, // An edit accepts an array of Ops
            	});
            
            	console.log("Your transaction hash is:", txHash);
                //// Update the person with the new geo_id
            
                await client.query('UPDATE search_court SET geo_id = $1 WHERE id = $2', [newGeoId, court.id]);
                console.log(`Updated person ID ${court.id} with geo_id ${newGeoId}`);
            }
        }
    } catch (err) {
        console.error('Error updating court:', err);
    } finally {
        // Close the database connection
        await client.end();
        console.log('Database connection closed');
    }
}

// Run the function
updatePeopleWithGeoId();


// UNUSED COLUMNS FOR COURTS
//  "date_modified", "in_use", "has_opinion_scraper", "has_oral_argument_scraper",
//  "pacer_has_rss_feed", "date_last_pacer_contact",
//  "pacer_rss_entry_types",


