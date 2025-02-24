//Lots of good information here: https://github.com/freelawproject/courtlistener/blob/main/cl/people_db/models.py

import { Client } from 'pg';
import { Id, Ipfs, SystemIds, Relation, Triple } from "@graphprotocol/grc-20";
import { Graph } from "@graphprotocol/grc-20";
import { deploySpace } from "./src/deploy-space";
import { publish } from "./src/publish";
import { format, parse } from "date-fns";
import { processPerson } from "./src/process_person";

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

function outputSectorId(sector: int): string | null{
    if (!sector) return null; // Handle missing date
    switch (sector) {
        case 1: return "BJFdEKqAbDKiruf1KATcZq"
        case 2: return "7jk5JaSz1qSmm7fG6oTzmq"
        default:
            return null;
    }
}


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

function outputPositionId(position_type: string): string | null{
    if (!position_type) return null; // Handle missing date
    switch (position_type.toLowerCase()) {
        case "jud": return "KSaZ12SWx7BCuQwUaCNUTo"
        case "jus": return "ReABWho92KxU1gKDuQ9pYU"
        case "ad-law-jud": return "6hKsBqqR8L1GYbqBXwH28b"
        case "act-jud": return "SBMfhmat9bhEYZdHYTmzm8"
        case "act-jus": return "8TE7VeMTjEQctQhvNYWW9d"
        case "act-pres-jud": return "DTZYhzMG8CQioDdJmhiE4G"
        case "act-c-admin-jus": return "YVwY51LnBqVycSt3Nxu97H"
        case "ad-pres-jus": return "AEUkgfEvxSv2FipGQmyK4G"
        case "ass-jud": return "PuRikbfjLGgVX4T8VwZ2Nh"
        case "ass-jus": return "BieNdx8yedP9ctE58D2qcX"
        case "ass-c-jud": return "Rt5wJt6MjwaioNDjoiVKBo"
        case "asst-pres-jud": return "G2FYFD5XJJrHzsN1hsBbCy"
        case "ass-pres-jud": return "HRbXz8L21ZtHY8bLdLmdAD"
        case "c-jud": return "ELsoBgGRcfxWbv17YGDXEi"
        case "c-jus": return "9FqXNgKouwsn2TSdyi89v9"
        case "c-spec-m": return "746YNcYpFrgCXc43pFD1zk"
        case "c-admin-jus": return "ToAT3ajdJXwEmLGoK8SMvN"
        case "c-spec-tr-jud": return "Kc6zeBRY3Qyv9sfB2x9HXe"
        case "pres-jud": return "GQ36437jEfihpJ1M1aENHK"
        case "pres-jus": return "PTN2zG7MrjuTVEAz2XvWX8"
        case "sup-jud": return "7DUUw2bstj7RoN3Vj8iL2v"
        case "com": return "PLb265XtuMTDjp8wuhJtr4"
        case "com-dep": return "JhCnFdYPAd548VvjNGjSVX"
        case "jud-pt": return "55FG5tx5ci4WFBjYgtV6Ra"
        case "jus-pt": return "XhbnhZR8kTsEXcJWxhtsW8"
        case "ref-jud-tr": return "YCTEtjgvLb1Sk37ipa9BX9"
        case "ref-off": return "HgyYwUjfJgknAySoiHSeWu"
        case "ref-state-trial": return "MMFpN5gFZQpiwaK8mGUDup"
        case "ret-act-jus": return "3o93DT9sPUzYuFCVrgzcwv"
        case "ret-ass-jud": return "9i4L2ocfwTBb1KQdeyTeYE"
        case "ret-c-jud": return "LmKQsefYYX9bkoYG3P9tpq"
        case "ret-jus": return "S9SRLK3zPdCDsjjnrCdWE5"
        case "ret-senior-jud": return "XP3gtLcpaiALjhFtTS6L6z"
        case "mag": return "Fo3Z9ano5YsE4T7uMFdNGF"
        case "c-mag": return "CfQ2GpwM6H5gq8x8AMoAUv"
        case "pres-mag": return "EaQPfFk7iJGE557ZdfF4su"
        case "mag-pt": return "21swTqyG1FKRsypTENnb5x"
        case "mag-rc": return "QhDdGmE2UJpRhycock2JJe"
        case "mag-part-time": return "RzFhqwYHdhLktKqrSvjZ7B"
        case "spec-chair": return "6CMYL7rZTNn1pmJj32nxhD"
        case "spec-jud": return "FmDSr9RC3Nxi1cddLCvFrp"
        case "spec-m": return "KdsrwKMNrNFJZhFVUkSBjg"
        case "spec-scjcbc": return "MfDrT96YXa6NxxUusWEwyY"
        case "spec-tr-jud": return "CH3icYt2JDDq5jjvPgG9sx"
        case "chair": return "DCqJGBUksYEFXAtJxfFXjk"
        case "chan": return "AXiPK32jm9Jn5uadgVCxC9"
        case "presi-jud": return "7VnSgPojH15BFR3RTwxeoa"
        case "res-jud": return "2ZKC6tP73UsbavuupCn4mt"
        case "trial-jud": return "AmsQJphYwQTwhLWgfyxqeY"
        case "vice-chan": return "Ny4tLSRAQ8VRL6pFSBT1s2"
        case "vice-cj": return "UEpoAvoFiXZ2QsT7ugQ7Nh"
        case "att-gen": return "SZ2k7qPkwnnGqudqTbaCdj"
        case "att-gen-ass": return "52DizcJSYFZP8pPwCDaq1J"
        case "att-gen-ass-spec": return "BpJ6wBAZsPqcnCMLbThWmf"
        case "sen-counsel": return "EM11p7MAb9Ts1KPhqpaEYJ"
        case "dep-sol-gen": return "PLRZprixDSyap1feMKqAQD"
        case "pres": return "WbNL9A75Nxqx8EevUXpBMZ"
        case "gov": return "XJpNesfQ7Q5Sdmx1Mdxaj3"
        case "mayor": return "FJPpvCXpsfPDQULBQTB491"
        case "clerk": return "8nUzYESN84XbzEL67fc7mi"
        case "clerk-chief-dep": return "J62iGii893XyeXPDKNNteu"
        case "staff-atty": return "55nyZ8fJKfJ2BW9UwBdtWS"
        case "prof": return "VWeTe2TLewNJRG6fzTSyWk"
        case "adj-prof": return "QU4faHVGg3nzDGViEK4bfy"
        case "prac": return "LorxoPJgVy891Z9uWqzWju"
        case "pros": return "8Q7cga83nrJZbjNSS6qo2T"
        case "pub-def": return "LwqCGY49znbwGVLmqKhifJ"
        case "da": return "MHLfwTJmhYRoBtTuvxNTxy"
        case "ada": return "GgvTon2nJR5nm21e4cd4A7"
        case "legis": return "XQCZoCWwXaxSbuS7dNdPxk"
        case "sen": return "UgDYbaELzyNXq2V6XaMY9m"
        case "state-sen": return "Q2URcwaS9esswz4FPbZqdc"
        default:
            return null;
    }
}

function outputTermReasonId(reason: string): string | null{
    if (!reason) return null; // Handle missing date
    switch (reason.toLowerCase()) {
        case "ded": return "MEA4YrsrNdjjA8TLruJbv1"
        case "retire_vol": return "NtfWVNg1qnd7oHKEkWTxY2"
        case "retire_mand": return "Ev2NRCEzD7Q7YLWM4iq8hy"
        case "resign": return "By6toJri2CMB7N9gh6ai4y"
        case "other_pos": return "JFcyoUfCuPYkiRF9VFirkx"
        case "lost": return "63NutxFeGamST7qBCYvBAN"
        case "abolished": return "2mCty3J6GNU7p5LQ7c8rA9"
        case "bad_judge": return "8Dr5ScvviLaiXMrKMohAmD"
        case "recess_not_confirmed": return "8rKERaSAs2D2KvwWhzzYUp"
        case "termed_out": return "K77KCTEHya1VLnt2pePSZE"
        default:
            return null;
    }
}

//SECTION METHODS
function outputSelectionMethodId(method: string): string | null{
    if (!method) return null; // Handle missing date
    switch (method.toLowerCase()) {
        case "e_part": return "P88dp8Viw1TVacAxFAWHbo"
        case "e_non_part": return "XuiHJMbKFZNN6uUYgAZiBG"
        case "a_pres": return "H3ctpTzMUusyLSMCZ2H31x"
        case "a_gov": return "91qbMcfREBuCqJdppikFBL"
        case "a_legis": return "6b3Axh9DgAynxhTaG55VVq"
        case "a_judge": return "VfWT5Wpi6BQ78iq8PeGVnd"
        case "ct_trans": return "7cAJhq5PZobTqh6vHY3VNG"
        default:
            return null;
    }
}

function outputNominationProcessId(process: string): string | null{
    if (!process) return null; // Handle missing date
    switch (process.toLowerCase()) {
        case "fed_senate": return "BLZRy7GPE3ErGmckmZ7JTb"
        case "state_senate": return "KqSyWeqaYAm87EPL2ZHb2q"
        case "election": return "U6yftHRXTt2KiJEkrKXgnP"
        case "merit_comm": return "9uNtVkvkBFfgmEVcoLboTj"
        default:
            return null;
    }
}

function outputJudicialCommitteeActionId(action: string): string | null{
    if (!action) return null; // Handle missing date
    switch (action.toLowerCase()) {
        case "no_rep": return "9atiaeDUCTVcf38Yz2Mjt8"
        case "rep_w_rec": return "JaiBn5Sx5yQDUtoF3XBXyq"
        case "rep_wo_rec": return "Js8ipob4m5bC1xDHpwJ4AL"
        case "rec_postpone": return "P7bxJwWMCwX16oXbYaoQuB"
        case "rec_bad": return "NLq2gtVNRm6idU99d7CKqB"
        default:
            return null;
    }
}

function outputVoteTypeId(type: string): string | null{
    if (!type) return null; // Handle missing date
    switch (type.toLowerCase()) {
        case "s": return "5CnEZVWy33hzs7svq2DyeP"
        case "p": return "D4Xn1fNsz3NLvhrEtvEzXy"
        case "np": return "3PEeu3JHKQePQy1AdP4hXZ"
        default:
            return null;
    }
}

// DEFINE NECESSARY CONSTANTS
const spaceId = "EzQsF1VvvPV5FVqcp6YTtt";

const endTimePropertyId = "R7X9rnVW49g29XvK5KMTtP";
const startTimePropertyId = "6cF7TMDBFwSt5vMENU3Cta";

const genderPropertyId = "5TfoSkkYjRLWeFo7JY8L4v";
const religionPropertyId = "BQ8qULbc1jPMPxmLZzG4WE";
const racePropertyId = "U63bdnHPEi5SW16MVSNGTW";
const politicalPartyPropertyId = "Wwjdxo6vQRRK7ttEVtjBE4";

const dobPropertyId = "3QdZ7QrPPGhvf6uMp7jAQi";
const dodPropertyId = "MZG6NbE8Ep5SDgZcnDQPFX";

const worksAtId = "U1uCAzXsRSTP4vFwo1JwJG";
const workedAtId = "8fvqALeBDwEExJsDeTcvnV";

const terminationReasonPropertyId = "WpgwJUhxfvdL9WGEUJDaSY";
const selectionMethodPropertyId = "Jp9LQT7fEwrzUaKcvN3qCv";

const sectorPropertyId = "QbW2fGzADs4dDKLYgSFBjy";

const supervisorPropertyId = "VFjq1AyeTikg8TiUCAKjre"; 
const predecessorPropertyId = "HSXjx1ffT1ZF39V6e2WYhz"; 
const retirementDatePropertyId = "BXomrhvB1qGzF9AC1HevqC"; 
const nominatedByPropertyId = "L1gd5xCzbiYv7R8UQDQLAE"; 

const nominationProcessPropertyId = "AGgyqdCtPbWAFtLu6NFBq1";
const voteTypePropertyId = "NNAmtzreGiU7ZYVyNARFjG";
const judicialCommitteeActionPropertyId = "NNAmtzreGiU7ZYVyNARFjG";

const nominationDatePropertyId = "Vq4CSd8E1SUCEaem3Rx2kq";
const judComRefDatePropertyId = "KajgZv66AruNMfiKyBTFMX";
const judComActDatePropertyId = "LitBkpvtuc8WGYGjJFUmtG";
const elecDatePropertyId = "3U6v8KHGrWccJMGYUskWfC";
const recessDatePropertyId = "Y8V2Xzij3EBrk7eeHUp5Lh";
const hearingDatePropertyId = "GoywoVtT9zM5gBNK2dMBPE";
const confirmDatePropertyId = "7HcLpi7gaNq1imd64dksvt";
const voiceVotePropertyId = "LcVh9XZVhxEgT93AAZWXEh";
const voteYesPropertyId = "P2fETWwsNtRdwecTXfEJDr";
const voteNoPropertyId = "T9x3ogeDvVMvjyyZXAa3Fe";
const voteYesPctPropertyId = "7tcDxJFDTP61pKTFFhaKAm";
const voteNoPctPropertyId = "DNqUien3tMhn4pWLXZnezY";

async function processPositions(input_person_id: int) {
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
                c.geo_id as court_geo_id,
                per.geo_id as person_geo_id
            FROM people_db_position as p
            LEFT JOIN search_court c ON p.court_id = c.id
            LEFT JOIN people_db_person per ON p.person_id = per.id
            WHERE p.person_id = ${input_person_id}
            AND p.court_id IS NOT NULL
        `);

        const positions = res.rows;
        

        // Iterate through each person and update with a new geo_id
        for (const position of positions) {
            
            if (!position.geo_id){

                const ops: Array<Op> = [];

                //If they have a position like US President or Senator -> 
                //Just give them a role property pointing to that thing and input the start and dates on that relationship

                
                let positionRelationId;
                if ((position.court_id !== null) && (position.position_type !== null || getJobKeyFromValue(position.job_title) !== null)){
                    //Position has a court_id -> Publish the job
                    
                    if (position.date_termination !== null) {
                        //Termination date exists -> WorkedAt Relation Type
                        const courtRelation = Relation.make({
                    		fromId: position.person_geo_id,
                    		toId: position.court_geo_id,
                    		relationTypeId: workedAtId,
                    	});
                        positionRelationId = courtRelation.relation.id;
                        ops.push(courtRelation);

                        console.log(`Court GEO ID: ${position.court_geo_id}`)
                        console.log(`PositionRelationId: ${positionRelationId}`)

                        
                    } else {
                        //No Termination date exists -> WorkedAt Relation Type
                        const courtRelation = Relation.make({
                    		fromId: position.person_geo_id,
                    		toId: position.court_geo_id,
                    		relationTypeId: worksAtId,
                    	});
                        positionRelationId = courtRelation.relation.id;
                        ops.push(courtRelation);

                        console.log(`Court GEO ID: ${position.court_geo_id}`)
                        console.log(`PositionRelationId: ${positionRelationId}`)
                    }

                    if ((position.position_type !== null)  && (position.position_type !== "")) {
                        const roleRelation = Relation.make({
                            fromId: positionRelationId,
                            toId: outputPositionId(position.position_type),
                            relationTypeId: SystemIds.ROLE_PROPERTY,
                        });
                        ops.push(roleRelation);
                        console.log(`Role ID: ${outputPositionId(position.position_type)}`)
                    } else if (getJobKeyFromValue(position.job_title) !== null) {
                        const roleRelation = Relation.make({
                            fromId: positionRelationId,
                            toId: outputPositionId(getJobKeyFromValue(position.job_title)),
                            relationTypeId: SystemIds.ROLE_PROPERTY,
                        });
                        ops.push(roleRelation);
                        console.log(`Role ID: ${outputPositionId(getJobKeyFromValue(position.job_title))}`)
                    }
                    
                    let startDate = null
                    let startFormat = null
                    let termDate = null
                    let termFormat = null
                    if ((position.date_start !== null)  && (position.date_start !== "")) {
                        const startDate = position.date_start.toISOString().split("T")[0] + "T00:00:00.000Z" //The start date for the position
                        const startFormat = getDateFormat(position.date_granularity_start)

                        const startDateTriple = Triple.make({
                            entityId: positionRelationId,
                            attributeId: startTimePropertyId,
                            value: {
                                type: "TIME",
                                value: startDate,
                                options: {
                                    format: startFormat
                                }
                            },
                        });
                        ops.push(startDateTriple);
                    }
                    if ((position.date_termination !== null)  && (position.date_termination !== "")) {
                        const termDate = position.date_termination.toISOString().split("T")[0] + "T00:00:00.000Z" //Termination date
                        const termFormat = getDateFormat(position.date_granularity_termination)

                        const termDateTriple = Triple.make({
                            entityId: positionRelationId,
                            attributeId: endTimePropertyId,
                            value: {
                                type: "TIME",
                                value: termDate,
                                options: {
                                    format: termFormat
                                }
                            },
                        });
                        ops.push(termDateTriple);

                        if ((position.termination_reason !== null)  && (position.termination_reason !== "")) {
                            //Relate to termination reason
                            const termRelation = Relation.make({
                        		fromId: positionRelationId,
                        		toId: outputTermReasonId(position.termination_reason),
                        		relationTypeId: terminationReasonPropertyId,
                        	});
                            ops.push(termRelation);
                            console.log(`Term Reason ID: ${outputTermReasonId(position.termination_reason)}`)
                        }
                    }

                    //Create Retirement Date Property
                    if ((position.date_retirement !== null)  && (position.date_retirement !== "")) {
                        const retireDate = position.date_retirement.toISOString().split("T")[0] + "T00:00:00.000Z"
                        const retirementDateTriple = Triple.make({
                            entityId: positionRelationId,
                            attributeId: retirementDatePropertyId,
                            value: {
                                type: "TIME",
                                value: retireDate,
                            },
                        });
                        ops.push(retirementDateTriple);
                    }

                    if ((position.sector !== null)  && (position.sector !== "")) {
                        const sectorRelation = Relation.make({
                            fromId: positionRelationId,
                            toId: outputSectorId(position.sector),
                            relationTypeId: sectorPropertyId,
                        });
                        console.log(`Sector ID: ${outputSectorId(position.sector)}`)
                        ops.push(sectorRelation);
                    }

                    

                    //Create Supervisor Property
                    if ((position.supervisor_id !== null)  && (position.supervisor_id !== "")) {

                        //is this person created? Turn this into a function!
                        const supervisorGeoId = await processPerson(position.supervisor_id, client);
                        
                        const supervisorRelation = Relation.make({
                            fromId: positionRelationId,
                            toId: supervisorGeoId,
                            relationTypeId: supervisorPropertyId,
                        });
                        console.log(`Supervisor ID: ${supervisorGeoId}`)
                        ops.push(supervisorRelation);
                    }
                    
                    //Create Predecessor Property
                    if ((position.predecessor_id !== null)  && (position.predecessor_id !== "")) {

                        //is this person created? Turn this into a function!
                        const predecessorGeoId = await processPerson(position.predecessor_id, client);
                        
                        const predecessorRelation = Relation.make({
                            fromId: positionRelationId,
                            toId: predecessorGeoId,
                            relationTypeId: predecessorPropertyId,
                        });
                        console.log(`Predecessor ID: ${predecessorGeoId}`)
                        ops.push(predecessorRelation);
                    }
                    
                    //Create Selection Method Relationship
                    if ((position.how_selected !== null)  && (position.how_selected !== "")) {
                        const selectionRelation = Relation.make({
                    		fromId: positionRelationId,
                    		toId: outputSelectionMethodId(position.how_selected),
                    		relationTypeId: selectionMethodPropertyId,
                    	});
                        console.log(`Selection Method ID: ${outputSelectionMethodId(position.how_selected)}`)
                        ops.push(selectionRelation);
                       
                    }
                    
                    if ((position.appointer_id !== null)  && (position.appointer_id !== "")) {
                        const appointerGeoId = await processPerson(position.appointer_id, client);
                        
                        const appointerRelation = Relation.make({
                            fromId: positionRelationId,
                            toId: appointerGeoId,
                            relationTypeId: nominatedByPropertyId,
                        });
                        console.log(`Appointer Geo ID: ${appointerGeoId}`)
                        ops.push(appointerRelation);
                    }

                    if ((position.nomination_process !== null)  && (position.nomination_process !== "")) {
                        
                        const nominationRelation = Relation.make({
                            fromId: positionRelationId,
                            toId: outputNominationProcessId(position.nomination_process),
                            relationTypeId: nominationProcessPropertyId,
                        });
                        console.log(`Nomination Relation ID: ${outputNominationProcessId(position.nomination_process)}`)
                        ops.push(nominationRelation);
                    }

                    if ((position.date_nominated !== null)  && (position.date_nominated !== "")) {
                        const nomDate = position.date_nominated.toISOString().split("T")[0] + "T00:00:00.000Z"

                        const nomDateTriple = Triple.make({
                            entityId: positionRelationId,
                            attributeId: nominationDatePropertyId,
                            value: {
                                type: "TIME",
                                value: nomDate,
                            },
                        });
                        ops.push(nomDateTriple);
                    }

                    if ((position.judicial_committee_action !== null) && (position.judicial_committee_action !== "")) {

                        const judComActRelation = Relation.make({
                            fromId: positionRelationId,
                            toId: outputJudicialCommitteeActionId(position.judicial_committee_action),
                            relationTypeId: judicialCommitteeActionPropertyId,
                        });
                        console.log(`judComActRelation ID: ${outputJudicialCommitteeActionId(position.judicial_committee_action)}`)
                        ops.push(judComActRelation);
                    }

                    if ((position.date_referred_to_judicial_committee !== null)  && (position.date_referred_to_judicial_committee !== "")) {
                        const refDate = position.date_referred_to_judicial_committee.toISOString().split("T")[0] + "T00:00:00.000Z"

                        const refDateTriple = Triple.make({
                            entityId: positionRelationId,
                            attributeId: judComRefDatePropertyId,
                            value: {
                                type: "TIME",
                                value: refDate,
                            },
                        });
                        ops.push(refDateTriple);
                    }
                    
                    if ((position.date_judicial_committee_action !== null)  && (position.date_judicial_committee_action !== "")) {
                        const actDate = position.date_judicial_committee_action.toISOString().split("T")[0] + "T00:00:00.000Z"

                        const actDateTriple = Triple.make({
                            entityId: positionRelationId,
                            attributeId: judComActDatePropertyId,
                            value: {
                                type: "TIME",
                                value: actDate,
                            },
                        });
                        ops.push(actDateTriple);
                    }

                    if ((position.date_elected !== null)  && (position.date_elected !== "")) {
                        const elecDate = position.date_elected.toISOString().split("T")[0] + "T00:00:00.000Z"

                        const elecDateTriple = Triple.make({
                            entityId: positionRelationId,
                            attributeId: elecDatePropertyId,
                            value: {
                                type: "TIME",
                                value: elecDate,
                            },
                        });
                        ops.push(elecDateTriple);
                    }
                    
                    if ((position.date_recess_appointment !== null)  && (position.date_recess_appointment !== "")) {
                        const recessDate = position.date_recess_appointment.toISOString().split("T")[0] + "T00:00:00.000Z"

                        const recessDateTriple = Triple.make({
                            entityId: positionRelationId,
                            attributeId: recessDatePropertyId,
                            value: {
                                type: "TIME",
                                value: recessDate,
                            },
                        });
                        ops.push(recessDateTriple);
                    }
                    
                    if ((position.date_hearing !== null)  && (position.date_hearing !== "")) {
                        const hearingDate = position.date_hearing.toISOString().split("T")[0] + "T00:00:00.000Z"

                        const hearingDateTriple = Triple.make({
                            entityId: positionRelationId,
                            attributeId: hearingDatePropertyId,
                            value: {
                                type: "TIME",
                                value: hearingDate,
                            },
                        });
                        ops.push(hearingDateTriple);
                    }
                    
                    if ((position.date_confirmation !== null)  && (position.date_confirmation !== "")) {
                        const confirmDate = position.date_confirmation.toISOString().split("T")[0] + "T00:00:00.000Z"

                        const confirmDateTriple = Triple.make({
                            entityId: positionRelationId,
                            attributeId: confirmDatePropertyId,
                            value: {
                                type: "TIME",
                                value: confirmDate,
                            },
                        });
                        ops.push(confirmDateTriple);
                    }
                    
                    if ((position.vote_type !== null)  && (position.vote_type !== "")) {
                        const voteTypeRelation = Relation.make({
                            fromId: positionRelationId,
                            toId: outputVoteTypeId(position.vote_type),
                            relationTypeId: voteTypePropertyId,
                        });
                        console.log(`voteTypeRelation ID: ${outputVoteTypeId(position.vote_type)}`)
                        ops.push(voteTypeRelation);
                    }
                    if ((position.voice_vote !== null)  && (position.voice_vote !== "")) {
                        const voiceVoteTriple = Triple.make({
                            entityId: positionRelationId,
                            attributeId: voiceVotePropertyId,
                            value: {
                                type: "CHECKBOX",
                                value: position.voice_vote ? "1": "0",
                            },
                        });
                        console.log(`voiceVoteTriple ID: ${position.voice_vote}`)
                        ops.push(voiceVoteTriple);
                    }

                    if ((position.votes_yes !== null)  && (position.votes_yes !== "")) {
                        const voteYesTriple = Triple.make({
                            entityId: positionRelationId,
                            attributeId: voteYesPropertyId,
                            value: {
                                type: "NUMBER",
                                value: position.votes_yes.toString(),
                            },
                        });
                        ops.push(voteYesTriple);
                    }

                    if ((position.votes_no !== null)  && (position.votes_no !== "")) {
                        const voteNoTriple = Triple.make({
                            entityId: positionRelationId,
                            attributeId: voteNoPropertyId,
                            value: {
                                type: "NUMBER",
                                value: position.votes_no.toString(),
                            },
                        });
                        ops.push(voteNoTriple);
                    }

                    if ((position.votes_yes_percent !== null)  && (position.votes_yes_percent !== "")) {
                        const voteYesTriple = Triple.make({
                            entityId: positionRelationId,
                            attributeId: voteYesPctPropertyId,
                            value: {
                                type: "NUMBER",
                                value: position.votes_yes_percent.toString(),
                            },
                        });
                        ops.push(voteYesTriple);
                    }

                    if ((position.votes_no_percent !== null)  && (position.votes_no_percent !== "")) {
                        const voteYesTriple = Triple.make({
                            entityId: positionRelationId,
                            attributeId: voteNoPctPropertyId,
                            value: {
                                type: "NUMBER",
                                value: position.votes_no_percent.toString(),
                            },
                        });
                        ops.push(voteYesTriple);
                    }   
                    
                }

            	// Once you have the ops you can publish them to IPFS and your space.
            	const txHash = await publish({
            		spaceId,
            		author: "0x84713663033dC5ba5699280728545df11e76BCC1",
            		editName: "Add Positions to RBG",
            		ops: ops, // An edit accepts an array of Ops
            	});
            
            	console.log("Your transaction hash is:", txHash);
                
                // Update the person with the new geo_id
                await client.query('UPDATE people_db_position SET geo_id = $1 WHERE id = $2', [positionRelationId, position.id]);
                console.log(`Updated position ID ${position.id} with geo_id ${positionRelationId}`);
            } else {
                console.log(`Position already exists with Geo ID: ${position.geo_id}`);
            }
            
            
        }
    } catch (err) {
        console.error('Error updating position:', err);
    } finally {
        // Close the database connection
        await client.end();
        console.log('Database connection closed');
    }
}

// Run the function
processPositions(1213);
