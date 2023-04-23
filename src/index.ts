import fs from 'fs';
import prettier from 'prettier';


// Types
type KeyValue = {
    [key: string]: any;
}

// Main parser
export default class SwaggerGenerateClient {
    private inputObject: any;
    private outputObject: object = {};

    private outputPath: string;

    constructor(input: string, output: string) {
        this.outputPath = process.cwd() + "/" + output;
        try {
            this.inputObject = require(process.cwd() + "/" + input);
        } catch (e) {
            console.error("Could not parse the swagger file");
            console.error(e);
            return;
        }

        const ast = this.ParseObject(this.inputObject);
        const outputZod = this.GenerateZod(ast.definitions);

        const outputTsType = this.GeneratePathsTsType(ast.paths);
        const outputTsObject = this.GeneratePathsObject(ast.paths);

        // Write to file
        const fileContent = `import * as z from 'zod';
        import wretch from "wretch";
        
        /**
         * Zod validators generated from swagger file
         */

        ${outputZod}

        /**
         * Typescript type for the API generated from swagger file
         */
        ${outputTsType}

        /**
         * Usable Object
         */
        ${outputTsObject}


        export default ApiCallerInstance; 
        `
        //fs.writeFileSync(this.outputPath, fileContent)
        
        fs.writeFileSync(this.outputPath, prettier.format(fileContent, {
            parser: "typescript",
            singleQuote: true,
            trailingComma: "none",
            semi: false,
            tabWidth: 4,
            useTabs: false,
            bracketSpacing: true,
            arrowParens: "avoid",
            endOfLine: "lf",
            printWidth: 200
        }));

    }
    private GeneratePathsObject(paths: any[]) {
        return `class ApiCallerInstance {
            private ResquestParams:Map<string,string> = new Map();
            private Headers:HeadersInit;
            private RootUrl:string;
            constructor(params:{headers?:HeadersInit,rootUrl?:string}){
                this.Headers = params.headers || {};
                this.RootUrl = params.rootUrl || "";
            }

            public ApiCall:SwaggerRequestType = {
                ${paths.map((p: any) => this.GeneratePathSubObject(p)).join(",\n")}
            }
        }`;
    }
    private GeneratePathSubObject(path: any) {
        if (path?.type === "route-simple") {
            return `${path.name}: {
                ${path.childs.map((c: any) => this.GeneratePathSubObject(c)).filter(Boolean).join(",")} 
            }`
        } 
        if (path?.type === "route-param") {
            return `${path.name}: (${path.name}:string)=>{
                this.ResquestParams.set("${path.name}",${path.name});
                return {
                    ${path.childs.map((c: any) => this.GeneratePathSubObject(c)).filter(Boolean).join(",")}
                }
            }`
        }
        
        if (path?.type === "route-method") {
            //Input
            let tryInput = this.GenerateMethodTSInputOutput(path.body?.content);
            let input = tryInput ? `(body: ${tryInput})` : "()";

            // Output
            let tryOutput = "";
            for (let response in path.responses) {
                tryOutput += this.GenerateMethodZodInputOutput(path.responses[response]?.content);
            }
            const formattedPath = path.path.replace(/{([^}]+)}/g, function(match:string, part1:string) {
                return `\${this.ResquestParams.get("${part1}")}`;
            })
 
            return `${path.method}: ${input} =>{
                return wretch(\`\${this.RootUrl}${formattedPath}\`).headers(this.Headers).${path.method}(${tryInput? 'body' : ''}).json().then((res) => {
                    ${
                        tryOutput.length ? 
                        `return ${tryOutput}.parse(res);`:
                        `return`
                    }
                })
            }`
        }
        
    }    
    private GeneratePathsTsType(paths: any[]) {
        return "export type SwaggerRequestType = {\n" +
            paths.map((p: any) => this.GeneratePathTsSubType(p)).join(",\n") +
            "}\n"
    }
    private GeneratePathTsSubType(path: any) {
        if (path?.type === "route-simple") {
            return `${path.name}: {
                ${path.childs.map((c: any) => this.GeneratePathTsSubType(c)).filter(Boolean).join(",")}
            }`
        }

        if (path?.type === "route-param") {
            return `${path.name}: (${path.name}:string)=>{
                ${path.childs.map((c: any) => this.GeneratePathTsSubType(c)).filter(Boolean).join(",")}
            }`
        }
        if (path?.type === "route-method") {
            //Input
            let tryInput = this.GenerateMethodTSInputOutput(path.body?.content);
            let input = tryInput ? `(body: ${tryInput})` : "()";

            // Output
            let tryOutput = "";
            for (let response in path.responses) {
                tryOutput += this.GenerateMethodTSInputOutput(path.responses[response]?.content);
            }
            let output = tryOutput || "void";

            return `${path.method}: ${input} => Promise<${output}>`
        }
    }    
    public GenerateMethodTSInputOutput(content: any) {
        let TypeList: Set<string> = new Set();
        for (let i in content) {
            if (content[i]?.schema?.$ref) {
                let ref = content[i]?.schema?.$ref.split("/");
                let refKey = ref[ref.length - 1];
                TypeList.add(refKey+"Type");
            } else if (content[i]?.schema?.type === "array" && content[i]?.schema?.items?.$ref) {
                let ref = content[i]?.schema?.items?.$ref.split("/");
                let refKey = ref[ref.length - 1];
                TypeList.add(refKey + "Type[]");
            }
        }
        return Array.from(TypeList).map((t: string) => `${t}`).join(" | ")
    }
    public GenerateMethodZodInputOutput(content: any) {
        let TypeList: Set<string> = new Set();
        for (let i in content) {
            if (content[i]?.schema?.$ref) {
                let ref = content[i]?.schema?.$ref.split("/"); 
                let refKey = ref[ref.length - 1];
                TypeList.add(refKey + "Validator");
            } else if (content[i]?.schema?.type === "array" && content[i]?.schema?.items?.$ref) {
                let ref = content[i]?.schema?.items?.$ref.split("/");
                let refKey = ref[ref.length - 1];
                TypeList.add(`z.array(${refKey}Validator)`);
            }
        }
        if (Array.from(TypeList).length > 1) {
            return 'z.union('+Array.from(TypeList).map((t: string) => `${t}`).join(",")+')';
        }
        return Array.from(TypeList).map((t: string) => `${t}`).join("");
    }


    private GenerateZod(definitions: KeyValue) {
        let elements: { name: string, code: string }[] = [];
        for (let key in definitions) {
            if (elements.find(e => e.name === key)) continue;
            elements.push({
                name: key,
                code: this.ParseZodItem(
                    definitions[key],
                    elements,
                    definitions
                )
            })
        }
        return `
        ${elements.map(e => `export const ${e.name}Validator = ${e.code};`).join("\n\n")}
        
        ${elements.map(e => `export type ${e.name}Type = z.infer<typeof ${e.name}Validator>;`).join("\n")}`;
    }


    private ParseZodItem(
        item: any,
        rootElements: { name: string, code: string }[] = [],
        rootObject: KeyValue

    ) {
        let returnString: string = "";
        switch (item.type) {
            case "object":
                returnString += "z.object({\n";
                if (item.properties) {
                    for (let key in item.properties) {
                        let property = item.properties[key];
                        returnString += key + ": " + this.ParseZodItem(property, rootElements, rootObject) + ",\n";
                    }
                }
                returnString += "})";
                break;
            case "array":
                returnString += "z.array(";
                returnString += this.ParseZodItem(item.items, rootElements, rootObject) + ",\n";
                returnString += ")";
                break;
            case "string":
                returnString += "z.string()";
                break;
            case "number":
                returnString += "z.number()";
                break;
            case "boolean":
                returnString += "z.boolean()";
                break;
            default:
                if (item.$ref) {
                    let ref = item.$ref.split("/");
                    let refKey = ref[ref.length - 1];

                    if (rootObject[refKey]) {
                        if (!rootElements.find(e => e.name === refKey)) {
                            rootElements.push({
                                name: refKey,
                                code: this.ParseZodItem(rootObject[refKey], rootElements, rootObject)
                            })
                        }
                        returnString += refKey + "Validator";
                        break;
                    }
                }
                returnString += "z.any()";
        }

        if (item.format === 'uuid') returnString += ".uuid()";
        if (item.format === 'date-time') returnString += ".datetime()";
        if (item.maxLength) returnString += ".max(" + item.maxLength + ")";
        if (item.minLength) returnString += ".min(" + item.minLength + ")";

        
       // if (!item.required) returnString += ".optional()";
        if (item.nullable) returnString += ".nullable()";


        return returnString;
    }






    private ParseObject(object: KeyValue) {
        return {
            paths: this.ParsePath(object),
            definitions: object?.components?.schemas
        }
    }


    private ParsePath(level: KeyValue, outputObject: any = []) {
        if (typeof this.inputObject == "object") {
            for (let path in this.inputObject.paths) {
                // Parse Path
                let parts = path.split('/');
                let pointerObject: any = outputObject;
                for (let part of parts) {
                    let found: RegExpMatchArray | null;
                    if (part) {
                        let p = pointerObject.find((l: any) => {
                            if (l.type === 'route-param') return l.name === part.substring(1, part.length - 1);
                            if (l.type === 'route-simple') return l.name === part;
                        });
                        if (!p) {
                            if (part.match(/{(.*)}/g,)) {
                                p = {
                                    type: 'route-param',
                                    name: part.substring(1, part.length - 1),
                                    param: part.substring(1, part.length - 1),
                                    childs: []
                                }
                            } else {
                                p = {
                                    type: 'route-simple',
                                    name: part,
                                    childs: []
                                }
                            }
                            pointerObject.push(p);
                        }
                        pointerObject = p.childs;
                    }
                }
                let methods = this.inputObject.paths[path];

                for (let method in methods) {
                    let methodObject = this.inputObject.paths[path][method];
                    pointerObject.push({
                        type: 'route-method',
                        path: path,
                        name: method,
                        method: method,
                        parameters: methodObject.parameters,
                        body: methodObject.requestBody,
                        responses: methodObject.responses
                    })
                }
            }
        }
        return outputObject;
    }
}
