import { Id, SystemIds, Relation, Triple } from "@graphprotocol/grc-20";

//Note: Place this file in your src folder and import with 'import { createProperty, createType } from "./src/useful_functions";'

//Inputs name of new property, optional description of new property, optional Id of already created type that should include this property in its list of properties (e.g. worksAt is in the properties list for the person type)
//Outputs array of ops to publish, entityId of new type created
//Example: const [opsArray, propertyId] = createProperty("propertyName", "valueType", "description?", "propertyOfId?");
export function createProperty(
    name: string, 
    valueType?: string | null, //Options = ['relation', 'checkbox', 'time', 'text', 'url', 'number', 'point', 'image', 'space']
    description?: string | null, 
    propertyOf?: string | null
): [object[], string | null] {
    const triplesAndRelations = [];

    const namePropertyId = SystemIds.NAME_PROPERTY;
    const descriptionPropertyId = SystemIds.DESCRIPTION_PROPERTY;
    
    const propertyId = SystemIds.PROPERTY;
    const propertiesRelId = SystemIds.PROPERTIES;
    
    const typeSchemaId = SystemIds.SCHEMA_TYPE;
    const typesAttributeId = SystemIds.TYPES_PROPERTY;

    //Value Types
    const valueTypeId = SystemIds.VALUE_TYPE_PROPERTY; 
    const relationId = SystemIds.RELATION;
    const checkboxId = SystemIds.CHECKBOX;
    const timeId = SystemIds.TIME;
    const textId = SystemIds.TEXT;
    const urlId = SystemIds.URL;
    const numberId = SystemIds.NUMBER;
    const pointId = SystemIds.POINT;
    const imageId = SystemIds.IMAGE;
    const spaceId = SystemIds.SPACE_TYPE;

    const entityId = Id.generate();

    //Create a citation string property
    const nameTriple = Triple.make({
        entityId: entityId,
        attributeId: namePropertyId,
        value: {
            type: "TEXT",
            value: name,
        },
    });
    triplesAndRelations.push(nameTriple);

    const propRel = Relation.make({
        fromId: entityId,
        toId: propertyId,
        relationTypeId: typesAttributeId,
    });
    triplesAndRelations.push(propRel);
    if (valueType) {
        if (valueType.toLowerCase() === "relation") {
            const valType = Relation.make({
                fromId: entityId,
                toId: relationId,
                relationTypeId: valueTypeId,
            });
            triplesAndRelations.push(valType);
        } else if (valueType.toLowerCase() === "checkbox") {
            const valType = Relation.make({
                fromId: entityId,
                toId: checkboxId,
                relationTypeId: valueTypeId,
            });
            triplesAndRelations.push(valType);
        } else if (valueType.toLowerCase() === "time") {
            const valType = Relation.make({
                fromId: entityId,
                toId: timeId,
                relationTypeId: valueTypeId,
            });
            triplesAndRelations.push(valType);
        } else if (valueType.toLowerCase() === "text") {
            const valType = Relation.make({
                fromId: entityId,
                toId: textId,
                relationTypeId: valueTypeId,
            });
            triplesAndRelations.push(valType);
        } else if (valueType.toLowerCase() === "url") {
            const valType = Relation.make({
                fromId: entityId,
                toId: urlId,
                relationTypeId: valueTypeId,
            });
            triplesAndRelations.push(valType);
        } else if (valueType.toLowerCase() === "number") {
            const valType = Relation.make({
                fromId: entityId,
                toId: numberId,
                relationTypeId: valueTypeId,
            });
            triplesAndRelations.push(valType);
        } else if (valueType.toLowerCase() === "point") {
            const valType = Relation.make({
                fromId: entityId,
                toId: pointId,
                relationTypeId: valueTypeId,
            });
            triplesAndRelations.push(valType);
        } else if (valueType.toLowerCase() === "image") {
            const valType = Relation.make({
                fromId: entityId,
                toId: imageId,
                relationTypeId: valueTypeId,
            });
            triplesAndRelations.push(valType);
        } else if (valueType.toLowerCase() === "space") {
            const valType = Relation.make({
                fromId: entityId,
                toId: spaceId,
                relationTypeId: valueTypeId,
            });
            triplesAndRelations.push(valType);
        }
        //Set Value Type
        else {
            console.log("invalid ValueType");
        }
    }

    // Conditionally add description if it's not null or undefined
    if (description) {
        const descTriple = Triple.make({
            entityId: entityId,
            attributeId: descriptionPropertyId,
            value: {
                type: "TEXT",
                value: description,
            },
        });
        triplesAndRelations.push(descTriple);
    }

    // Conditionally add propertyOf if it's not null or undefined
    if (propertyOf) {
        const propOfRel = Relation.make({
            fromId: propertyOf,
            toId: entityId,
            relationTypeId: propertiesRelId,
        });
        triplesAndRelations.push(propOfRel);
    }

    return [triplesAndRelations, entityId ?? null];
    //Outputs array of ops to publish, entityId of new property created
}

//Inputs name of new type, optional description of new type, optional Id of Type to link to (e.g. type of person)
//Outputs array of ops to publish, entityId of new type created
//Example: const [opsArray, propertyId] = createType("typeName", "description?", "typeOfId?")
//Note: if no typeOfId included, it will assume type of Type
export function createType(
    name: string, 
    description?: string | null, 
    TypeOf?: string | null
): [object[], string | null] {
    const triplesAndRelations = [];

    const namePropertyId = SystemIds.NAME_PROPERTY;
    const descriptionPropertyId = SystemIds.DESCRIPTION_PROPERTY;
    
    const typeSchemaId = SystemIds.SCHEMA_TYPE;
    const typesAttributeId = SystemIds.TYPES_PROPERTY;

    const entityId = Id.generate();

    //Create a citation string property
    const nameTriple = Triple.make({
        entityId: entityId,
        attributeId: namePropertyId,
        value: {
            type: "TEXT",
            value: name,
        },
    });
    triplesAndRelations.push(nameTriple);

    // Conditionally add description if it's not null or undefined
    if (description) {
        const descTriple = Triple.make({
            entityId: entityId,
            attributeId: descriptionPropertyId,
            value: {
                type: "TEXT",
                value: description,
            },
        });
        triplesAndRelations.push(descTriple);
    }

    // Conditionally add TypeOf if it's not null or undefined
    if (TypeOf) {
        const typeRel = Relation.make({
            fromId: entityId,
            toId: TypeOf,
            relationTypeId: typesAttributeId,
        });
        triplesAndRelations.push(typeRel);
    } else {
        const typeRel = Relation.make({
            fromId: entityId,
            toId: typeSchemaId,
            relationTypeId: typesAttributeId,
        });
        triplesAndRelations.push(typeRel);
    }

    return [triplesAndRelations, entityId ?? null];
    
}