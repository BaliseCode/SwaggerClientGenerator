# Introduction

Swagger Client Generator is a tool that enables developers to easily parse Swagger API specification files and generate code bindings that are type safe using the popular validation library Zod and the flexible HTTP client Wretch. Swagger Client Generator makes it easy to generate high-quality code that is both scalable and maintainable. 

# Generate your API client

## Installation


    npm install @balise/swagger-client-generator

The following code explains how to generate code bindings from a swagger.json file.

    import SwaggerGenerateClient from "@balise/swagger-client-generator";

    let Query = new SwaggerGenerateClient('inputfile.json', 'outputfile.ts');

## Integrate with Vite 

Todo


# Use the API client

## Instanciate the API
To use the Api you can add the following code to your application to instanciate a caller. That will create a Call object that you can use to call your API.

    import ApiCallerInstance from "./outputfile";

    const Call = new ApiCallerInstance({
        rootUrl: 'https://localhost:3000',
        headers: {
            'Bearer: 'SomeToken'
        }
    }).ApiCall;


## Make an API Call
Next when you need to call the API you can use the following pattern

    let u = {
        first_name: "James", 
        last_name: "Bond"
    }

    Call.Projets.Users.post(u).then((res) => {
        console.log(res)
    }).catch((err) => {
        console.error(err)
    });

the *u* object will be validated trough the Zod library, and wrech will make a post request at the *https://localhost:3000/Projets/Users* endpoint using the bearer token from the setup

#Types
The Library also generates and exports Types and Validators from schemas from the Swagger file. 

For the Project schema, ProjectValidator is a Zod validator and ProjectType is a type infered from this validator
