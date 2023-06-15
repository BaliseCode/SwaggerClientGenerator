"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const prettier_1 = __importDefault(require("prettier"));
// Main parser
class SwaggerGenerateClient {
    constructor(input, output) {
        this.outputObject = {};
        this.outputPath = process.cwd() + "/" + output;
        try {
            this.inputObject = require(process.cwd() + "/" + input);
        }
        catch (e) {
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
        `;
        //fs.writeFileSync(this.outputPath, fileContent)
        fs_1.default.writeFileSync(this.outputPath, prettier_1.default.format(fileContent, {
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
    GeneratePathsObject(paths) {
        return `class ApiCallerInstance {
            private ResquestParams:Map<string,string> = new Map();
            private Headers:HeadersInit;
            private RootUrl:string;
            constructor(params:{headers?:HeadersInit,rootUrl?:string}){
                this.Headers = params.headers || {};
                this.RootUrl = params.rootUrl || "";
            }

            public ApiCall:SwaggerRequestType = {
                ${paths.map((p) => this.GeneratePathSubObject(p)).join(",\n")}
            }
        }`;
    }
    GeneratePathSubObject(path) {
        var _a, _b;
        if ((path === null || path === void 0 ? void 0 : path.type) === "route-simple") {
            return `${path.name}: {
                ${path.childs.map((c) => this.GeneratePathSubObject(c)).filter(Boolean).join(",")} 
            }`;
        }
        if ((path === null || path === void 0 ? void 0 : path.type) === "route-param") {
            return `${path.name}: (${path.name}:string)=>{
                this.ResquestParams.set("${path.name}",${path.name});
                return {
                    ${path.childs.map((c) => this.GeneratePathSubObject(c)).filter(Boolean).join(",")}
                }
            }`;
        }
        if ((path === null || path === void 0 ? void 0 : path.type) === "route-method") {
            //Input
            let tryInput = this.GenerateMethodTSInputOutput((_a = path.body) === null || _a === void 0 ? void 0 : _a.content);
            let input = tryInput ? `(body: ${tryInput})` : "()";
            // Output
            let tryOutput = "";
            for (let response in path.responses) {
                tryOutput += this.GenerateMethodZodInputOutput((_b = path.responses[response]) === null || _b === void 0 ? void 0 : _b.content);
            }
            const formattedPath = path.path.replace(/{([^}]+)}/g, function (match, part1) {
                return `\${this.ResquestParams.get("${part1}")}`;
            });
            return `${path.method}: ${input} =>{
                return wretch(\`\${this.RootUrl}${formattedPath}\`).headers(this.Headers).${path.method}(${tryInput ? 'body' : ''}).json().then((res) => {
                    ${tryOutput.length ?
                `return ${tryOutput}.parse(res);` :
                `return`}
                })
            }`;
        }
    }
    GeneratePathsTsType(paths) {
        return "export type SwaggerRequestType = {\n" +
            paths.map((p) => this.GeneratePathTsSubType(p)).join(",\n") +
            "}\n";
    }
    GeneratePathTsSubType(path) {
        var _a, _b;
        if ((path === null || path === void 0 ? void 0 : path.type) === "route-simple") {
            return `${path.name}: {
                ${path.childs.map((c) => this.GeneratePathTsSubType(c)).filter(Boolean).join(",")}
            }`;
        }
        if ((path === null || path === void 0 ? void 0 : path.type) === "route-param") {
            return `${path.name}: (${path.name}:string)=>{
                ${path.childs.map((c) => this.GeneratePathTsSubType(c)).filter(Boolean).join(",")}
            }`;
        }
        if ((path === null || path === void 0 ? void 0 : path.type) === "route-method") {
            //Input
            let tryInput = this.GenerateMethodTSInputOutput((_a = path.body) === null || _a === void 0 ? void 0 : _a.content);
            let input = tryInput ? `(body: ${tryInput})` : "()";
            // Output
            let tryOutput = "";
            for (let response in path.responses) {
                tryOutput += this.GenerateMethodTSInputOutput((_b = path.responses[response]) === null || _b === void 0 ? void 0 : _b.content);
            }
            let output = tryOutput || "void";
            return `${path.method}: ${input} => Promise<${output}>`;
        }
    }
    GenerateMethodTSInputOutput(content) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        let TypeList = new Set();
        for (let i in content) {
            if ((_b = (_a = content[i]) === null || _a === void 0 ? void 0 : _a.schema) === null || _b === void 0 ? void 0 : _b.$ref) {
                let ref = (_d = (_c = content[i]) === null || _c === void 0 ? void 0 : _c.schema) === null || _d === void 0 ? void 0 : _d.$ref.split("/");
                let refKey = ref[ref.length - 1];
                TypeList.add(refKey + "Type");
            }
            else if (((_f = (_e = content[i]) === null || _e === void 0 ? void 0 : _e.schema) === null || _f === void 0 ? void 0 : _f.type) === "array" && ((_j = (_h = (_g = content[i]) === null || _g === void 0 ? void 0 : _g.schema) === null || _h === void 0 ? void 0 : _h.items) === null || _j === void 0 ? void 0 : _j.$ref)) {
                let ref = (_m = (_l = (_k = content[i]) === null || _k === void 0 ? void 0 : _k.schema) === null || _l === void 0 ? void 0 : _l.items) === null || _m === void 0 ? void 0 : _m.$ref.split("/");
                let refKey = ref[ref.length - 1];
                TypeList.add(refKey + "Type[]");
            }
        }
        return Array.from(TypeList).map((t) => `${t}`).join(" | ");
    }
    GenerateMethodZodInputOutput(content) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        let TypeList = new Set();
        for (let i in content) {
            if ((_b = (_a = content[i]) === null || _a === void 0 ? void 0 : _a.schema) === null || _b === void 0 ? void 0 : _b.$ref) {
                let ref = (_d = (_c = content[i]) === null || _c === void 0 ? void 0 : _c.schema) === null || _d === void 0 ? void 0 : _d.$ref.split("/");
                let refKey = ref[ref.length - 1];
                TypeList.add(refKey + "Validator");
            }
            else if (((_f = (_e = content[i]) === null || _e === void 0 ? void 0 : _e.schema) === null || _f === void 0 ? void 0 : _f.type) === "array" && ((_j = (_h = (_g = content[i]) === null || _g === void 0 ? void 0 : _g.schema) === null || _h === void 0 ? void 0 : _h.items) === null || _j === void 0 ? void 0 : _j.$ref)) {
                let ref = (_m = (_l = (_k = content[i]) === null || _k === void 0 ? void 0 : _k.schema) === null || _l === void 0 ? void 0 : _l.items) === null || _m === void 0 ? void 0 : _m.$ref.split("/");
                let refKey = ref[ref.length - 1];
                TypeList.add(`z.array(${refKey}Validator)`);
            }
        }
        if (Array.from(TypeList).length > 1) {
            return 'z.union(' + Array.from(TypeList).map((t) => `${t}`).join(",") + ')';
        }
        return Array.from(TypeList).map((t) => `${t}`).join("");
    }
    GenerateZod(definitions) {
        let elements = [];
        for (let key in definitions) {
            if (elements.find(e => e.name === key))
                continue;
            elements.push({
                name: key,
                code: this.ParseZodItem(definitions[key], elements, definitions)
            });
        }
        return `
        ${elements.map(e => `export const ${e.name}Validator = ${e.code};`).join("\n\n")}
        
        ${elements.map(e => `export type ${e.name}Type = z.infer<typeof ${e.name}Validator>;`).join("\n")}`;
    }
    ParseZodItem(item, rootElements = [], rootObject) {
        let returnString = "";
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
                            });
                        }
                        returnString += refKey + "Validator";
                        break;
                    }
                }
                returnString += "z.any()";
        }
        if (item.format === 'uuid')
            returnString += ".uuid()";
        if (item.format === 'date-time')
            returnString += ".datetime()";
        if (item.maxLength)
            returnString += ".max(" + item.maxLength + ")";
        if (item.minLength)
            returnString += ".min(" + item.minLength + ")";
        // if (!item.required) returnString += ".optional()";
        if (item.nullable)
            returnString += ".nullable()";
        return returnString;
    }
    ParseObject(object) {
        var _a;
        return {
            paths: this.ParsePath(object),
            definitions: (_a = object === null || object === void 0 ? void 0 : object.components) === null || _a === void 0 ? void 0 : _a.schemas
        };
    }
    ParsePath(level, outputObject = []) {
        if (typeof this.inputObject == "object") {
            for (let path in this.inputObject.paths) {
                // Parse Path
                let parts = path.split('/');
                let pointerObject = outputObject;
                for (let part of parts) {
                    let found;
                    if (part) {
                        let p = pointerObject.find((l) => {
                            if (l.type === 'route-param')
                                return l.name === part.substring(1, part.length - 1);
                            if (l.type === 'route-simple')
                                return l.name === part;
                        });
                        if (!p) {
                            if (part.match(/{(.*)}/g)) {
                                p = {
                                    type: 'route-param',
                                    name: part.substring(1, part.length - 1),
                                    param: part.substring(1, part.length - 1),
                                    childs: []
                                };
                            }
                            else {
                                p = {
                                    type: 'route-simple',
                                    name: part,
                                    childs: []
                                };
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
                    });
                }
            }
        }
        return outputObject;
    }
}
exports.default = SwaggerGenerateClient;
