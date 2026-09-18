import MetaApi from 'metaapi.cloud-sdk';
const token = process.env.META_API_TOKEN || "token";
const metaApi = new MetaApi(token);
console.log(metaApi);
