import { getStoreProduct, searchStore } from "../store-api.js";

const query = process.argv[2] ?? "monitor";
const matches = await searchStore(query);
console.log(`Found ${matches.length} matches for "${query}".`);
console.table(matches.slice(0, 5).map(({ id, name, sku }) => ({ id, name, sku })));
if (matches[0]) console.log(await getStoreProduct(String(matches[0].id)));
