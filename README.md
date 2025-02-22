# Geo Hackathon

In order to start publishing data to Geo, you first need to organize and understand your data. Evaluating the different entities withing your dataset will help you structure the necessary Types are Properties that will encompass the Ontology for this area of data. 

I have created a few useful functions within the useful_functions.ts file that may help you as you start creating these entities within Geo. Below, I will explain how this process works using data from the US courts system.

First, lets understand what types of data are included. Courts are entities within which the legal process unfolds. Courthouses are the buildings where those court entiites reside. Court cases are the incremental work that is conducted within a court. Judges are the individuals who hear court cases. Arguments are made by attorneys to convince a judge of the outcome of a court case. Opinions are the result of that case as decided by the judge. 

Okay, that is a lot. So, first, lets focus in on our simplest entity. This would be the one that has the least outward connections. Without getting too into the weeds, lets start with Courts.

First, lets look at a simple sample of the data exists for a court.

- Court Name: The name of the court
- Start Date: The date of courts founding
- End Date: The date the court ended, if it no longer exists.
- Jurisdiction: The jurisdiction of the court (e.g. Federal Appellate, State Supreme, Territory Trial, etc.)
- Citation Abbreviation: The citation abbreviation for the court as dictated by Blue Book
- Url: The website url for the court

Now, how should these be represented within Geo? Before dumping a bunch of data into Geo, lets think about how it should be structured and make sure the necessary Types and Properties are in place. As an example, lets use the US Supreme Court.

- Court Name: Supreme Court of the United States
- Start Date: 1789-09-24
- End Date: None
- Jurisdiction: Federal Appellate
- Citation Abbreviation: SCOTUS
- Url: http://supremecourt.gov/

First question, what Type should the court be? It isnt a person. It isnt really a company. After looking, it appears we will need to create a new type for Court. 

Here is where the useful_functions.ts file will begin to help.

In order to define the court type, lets use the createType function. Here is an example of what the createType function takes as inputs. Note: leaving the third input as null, by default makes the new Type entity of Type Type.

```
//const [opsArray, courtTypeId] = createType("typeName", "description?", "typeOfId?"))
const [opsArray, courtTypeId] = createType("Court", null, null))
```

Now, we have a court Type Entity. Let, now create our first few triples for the Supreme Court. We can start with Name, StartDate, and URL.

```
scotusId = Id.generate();
const namePropertyId = SystemIds.NAME_ATTRIBUTE;
const nameTriple = Triple.make({
      entityId: scotusId,
          attributeId: namePropertyId,
      value: {
        type: "TEXT",
        value: "Supreme Court of the United States",
      },
});

const startDateTriple = Triple.make({
      entityId: scotusId,
      attributeId: startTimePropertyId,
      value: {
          type: "TIME",
          value: startDate.toISOString().split("T")[0] + "T00:00:00.000Z",
      },
});

const urlTriple = Triple.make({
      entityId: scotusId,
          attributeId: webUrlPropertyId,
      value: {
        type: "URL",
        value: url,
      },
});

```

But notice, we have not set the Supreme Courts Type yet. We need to relate it back to court Type entity we created earlier. Let's do that below.

```
const courtRelation = Relation.make({
      fromId: scotusId,
      toId: courtEntityId,
      relationTypeId: typesPropertyId,
});
```
Now, in order to add the Citation String, we will need to create a new citation string property. Again, we can use the useful_functions.ts to do this.

```

//const [opsArray, propertyId] = createProperty("propertyName", "valueType", "description?", "propertyOfId?");
const [opsArray, citAbbrevPropertyId] = createProperty("Citation Abbreviation", "text", "The citation abbreviation for the court as dictated by Blue Book", "courtTypeId");

```

Notice that I included the valueType text because the citation abbreviation will just be a text string. I also included a description. And I included the ID to the previously created court Type so that it shows up as in the Properties list on the court Type page. Lets also add our citation string to the Supreme Court entity.

```
const citAbbrevTriple = Triple.make({
      entityId: scotusId,
          attributeId: citAbbrevPropertyId,
      value: {
        type: "TEXT",
        value: "SCOTUS",
      },
});

```

Lastly, we need to create a property and a type to hold the Jurisdiction entity. We need to create two different entities for this. First, there needs to be a jurisdiction type becasue there will be many different jurisdictions that need to be added like the ones listed previously. Those should be created with a Jurisdiction Type. Then we will also need to add Federal Appellate to the Supreme Court entity as a relation with relationType set as a Jurisdiction property. Okay, let's again, use the useful_functions.ts to do this. 


```
//Create Jurisdiction Type
const [opsArray, jurisdictionTypeId] = createType("Jusdiction", "The jurisdiction of the court (e.g. Federal Appellate, State Supreme, Territory Trial, etc.)", null))
//Create Federal Appellate with type Jurisdiction Type

//Create Federal Appellate Jurisdiction
federalAppellateId = Id.generate();
const namePropertyId = SystemIds.NAME_ATTRIBUTE;
const nameTriple = Triple.make({
      entityId: federalAppellateId,
          attributeId: namePropertyId,
      value: {
        type: "TEXT",
        value: "Federal Appellates",
      },
});

const federalAppellateRelation = Relation.make({
      fromId: federalAppellateId,
      toId: jurisdictionTypeId,
      relationTypeId: typesPropertyId,
});

//Create Jurisdiction Property
//Note: The last input will again make sure this entity is listed in the Courts Type as a property
const [opsArray, jurisdictionPropertyId] = createProperty("Jurisdiction", "relation", "The jurisdiction of the court (e.g. Federal Appellate, State Supreme, Territory Trial, etc.)", "courtTypeId");

//Link Federal Appellate Jurisdiction to the Supreme Court Entity

const scotusJurisdictionRelation = Relation.make({
      fromId: scotusId,
      toId: federalAppellateId,
      relationTypeId: jurisdictionPropertyId,
});


```

Okay, now we have created our first court. To see the final product, you can see The Supreme Court [here](https://geogenesis-git-feat-testnet-geo-browser.vercel.app/space/EzQsF1VvvPV5FVqcp6YTtt/UQPkVXbPH3jJNX59mmSxZ8), from which you can link to all the other types and properties created!
