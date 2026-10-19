"use client";

import { useCallback, useEffect, useState } from "react";

type Row = Record<string, unknown>;
type Resource = "customers" | "suppliers" | "products" | "invoices" | "customer-payments" | "supplier-bills" | "supplier-payments";
const definitions: Record<Resource, { title: string; columns: { key: string; label: string }[] }> = {
  customers: { title: "Customers", columns: [{key:"customerCode",label:"Code"},{key:"name",label:"Customer"},{key:"email",label:"Email"},{key:"status",label:"Status"}] },
  suppliers: { title: "Suppliers", columns: [{key:"supplierCode",label:"Code"},{key:"name",label:"Supplier"},{key:"email",label:"Email"},{key:"status",label:"Status"}] },
  products: { title: "Products", columns: [{key:"sku",label:"SKU"},{key:"name",label:"Product"},{key:"type",label:"Type"},{key:"status",label:"Status"}] },
  invoices: { title: "Sales invoices", columns: [{key:"invoiceNumber",label:"Invoice"},{key:"customerId",label:"Customer ID"},{key:"totalAmount",label:"Total"},{key:"status",label:"Status"}] },
  "customer-payments": { title: "Customer payments", columns: [{key:"paymentNumber",label:"Payment"},{key:"customerId",label:"Customer ID"},{key:"amount",label:"Amount"},{key:"status",label:"Status"}] },
  "supplier-bills": { title: "Supplier bills", columns: [{key:"billNumber",label:"Bill"},{key:"supplierId",label:"Supplier ID"},{key:"totalAmount",label:"Total"},{key:"status",label:"Status"}] },
  "supplier-payments": { title: "Supplier payments", columns: [{key:"paymentNumber",label:"Payment"},{key:"supplierId",label:"Supplier ID"},{key:"amount",label:"Amount"},{key:"status",label:"Status"}] },
};
function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return "—";
}
export default function LiveRecords({ resource, tenantId, branchId }: { resource: Resource; tenantId: string; branchId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError(""); setRows([]);
    try {
      const params = new URLSearchParams({resource,tenantId,branchId});
      const response = await fetch(`/api/backend/records?${params}`, {cache:"no-store"});
      const json: unknown = await response.json();
      if (!json || typeof json !== "object") throw new Error("Invalid server response");
      const result = json as {data?:unknown;message?:string;error?:string};
      if (!response.ok) throw new Error(result.message ?? result.error ?? `Request failed (${response.status})`);
      if (!Array.isArray(result.data)) throw new Error("Unexpected record list response");
      setRows(result.data.filter((item): item is Row => item !== null && typeof item === "object" && !Array.isArray(item)));
    } catch(e) { setError(e instanceof Error ? e.message : "Unable to load records"); }
    finally { setLoading(false); }
  },[resource,tenantId,branchId]);
  useEffect(() => { void load(); },[load]);
  const def = definitions[resource];
  const filtered = rows.filter(row => Object.values(row).some(v => typeof v === "string" && v.toLowerCase().includes(query.toLowerCase())));
  return <section className="panel" style={{padding:24,marginTop:20}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}><div><h2>{def.title}</h2><p>Live records from your authenticated business workspace</p></div><button className="primary-button" type="button" onClick={() => void load()} disabled={loading}>{loading?"Loading…":"Refresh"}</button></div>
    <div style={{margin:"18px 0",display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}><input aria-label="Search records" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search records" style={{padding:12,border:"1px solid #cbd5e1",borderRadius:8,minWidth:240,maxWidth:"100%"}}/><span>{loading?"Loading…":`${filtered.length} of ${rows.length} records`}</span></div>
    {error ? <p role="alert" style={{color:"#b91c1c"}}>{error}</p> : loading ? <p>Loading records…</p> : filtered.length===0 ? <p>{query?"No matching records.":"No records found in this workspace."}</p> : <div className="table-scroll"><table><thead><tr>{def.columns.map(col=><th key={col.key}>{col.label}</th>)}</tr></thead><tbody>{filtered.map((row,i)=><tr key={String(row.id??i)}>{def.columns.map(col=><td key={col.key}>{formatValue(row[col.key])}</td>)}</tr>)}</tbody></table></div>}
    <p style={{fontSize:12,marginTop:16,color:"#64748b"}}>Read-only live module. Financial posting and record creation will be enabled after their transaction tests pass.</p>
  </section>;
}
