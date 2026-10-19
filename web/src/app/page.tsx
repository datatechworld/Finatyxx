"use client";

import { useState } from "react";
import LiveRecords from "@/components/LiveRecords";

const navigation = [
  { section: "WORKSPACE", items: ["Overview", "Sales & Invoices", "Purchases", "Customers", "Suppliers"] },
  { section: "FINANCE", items: ["Accounting", "Banking", "Inventory", "Payroll & Tax", "Reports"] },
  { section: "MANAGEMENT", items: ["Team & Branches", "Settings"] },
];

const icons: Record<string, string> = {
  Overview: "◫", "Sales & Invoices": "▤", Purchases: "◈", Customers: "♙", Suppliers: "♧",
  Accounting: "▦", Banking: "▥", Inventory: "⬡", "Payroll & Tax": "◎", Reports: "▧",
  "Team & Branches": "♧", Settings: "⚙",
};

const metrics = [
  { label: "Total revenue", amount: "GHS 128,450", change: "+12.8%", trend: "up", color: "teal" },
  { label: "Total expenses", amount: "GHS 48,320", change: "+4.2%", trend: "neutral", color: "blue" },
  { label: "Outstanding invoices", amount: "GHS 26,750", change: "8 unpaid", trend: "neutral", color: "amber" },
  { label: "Net cash flow", amount: "GHS 80,130", change: "+9.6%", trend: "up", color: "purple" },
];

const activity = [
  { name: "Invoice INV-0042", detail: "Acme Trading Ltd · Sales invoice", amount: "+ GHS 8,450.00", status: "Paid", kind: "income" },
  { name: "Supplier bill BILL-0021", detail: "Bright Supplies · Purchase", amount: "− GHS 2,380.00", status: "Pending", kind: "expense" },
  { name: "Invoice INV-0041", detail: "Northstar Services · Sales invoice", amount: "+ GHS 5,200.00", status: "Overdue", kind: "income" },
  { name: "Customer payment PAY-0018", detail: "Coastal Ventures · Payment received", amount: "+ GHS 3,750.00", status: "Completed", kind: "income" },
];

const chart = [
  { month: "May", revenue: 52, expenses: 29 }, { month: "Jun", revenue: 66, expenses: 35 },
  { month: "Jul", revenue: 61, expenses: 39 }, { month: "Aug", revenue: 79, expenses: 43 },
  { month: "Sep", revenue: 70, expenses: 37 }, { month: "Oct", revenue: 93, expenses: 46 },
];

export default function Home() {
  const [active, setActive] = useState("Overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [period, setPeriod] = useState("Last 6 months");
  const [notice, setNotice] = useState("");
  // Development workspace only; replace with authorized workspace discovery before production.
  const [tenantId, setTenantId] = useState("9af89483-476a-4367-99b0-8cc15abc0011");
  const [branchId, setBranchId] = useState("8b675c86-7c95-4da8-a0b8-37be06f3cf64");
  const moduleResources: Record<string, "customers" | "suppliers" | "products" | "invoices" | "customer-payments" | "supplier-bills" | "supplier-payments"> = {
    "Customers": "customers", "Suppliers": "suppliers", "Inventory": "products", "Sales & Invoices": "invoices", "Purchases": "supplier-bills"
  };

  function navigate(item: string) {
    setActive(item);
    setSidebarOpen(false);
    if (item !== "Overview" && !moduleResources[item]) setNotice(`${item} workspace is coming in the next development phase.`);
    else setNotice("");
  }

  return (
    <div className="finatyx-app">
      {sidebarOpen && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand"><div className="brand-symbol">F<span>.</span></div><div><strong>finatyx</strong><small>BUSINESS FINANCE</small></div></div>
        <div className="workspace-switch"><span className="workspace-avatar">FT</span><span><strong>Finatyx Test Business</strong><small>Business workspace</small></span><span className="chevron">⌄</span></div>
        <nav aria-label="Main navigation">
          {navigation.map(group => <div className="nav-group" key={group.section}><p className="nav-label">{group.section}</p>{group.items.map(item => <button key={item} className={`nav-item ${active === item ? "nav-active" : ""}`} onClick={() => navigate(item)}><span className="nav-icon">{icons[item]}</span><span>{item}</span>{item === "Overview" && <span className="active-dot" />}</button>)}</div>)}
        </nav>
        <div className="sidebar-footer"><div className="help-card"><div className="help-icon">?</div><strong>Need a hand?</strong><p>We're here to help you get the most out of Finatyx.</p><button onClick={() => setNotice("Help center will be connected in a future release.")}>Visit help center ↗</button></div><div className="user-card"><div className="user-avatar">FT</div><span><strong>Finatyx Team</strong><small>Workspace owner</small></span><span className="chevron">⋯</span></div></div>
      </aside>
      <div className="main-area">
        <header className="topbar"><button className="menu-toggle" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}>☰</button><div className="breadcrumbs">Workspace <span>/</span> <strong>{active}</strong></div><div className="topbar-right"><span className="environment-pill"><span /> Demo workspace</span><button className="icon-button" aria-label="Notifications" onClick={() => setNotice("Notifications will be available soon.")}>♧</button><div className="top-avatar">FT</div></div></header>
        <main className="content">
          <div className="page-heading"><div><p className="eyebrow">YOUR FINANCIAL WORKSPACE</p><h1>{active === "Overview" ? "Good to see you again 👋" : active}</h1><p className="subheading">{active === "Overview" ? "Here's what's happening with your business today." : "This module will be connected to your existing Finatyx backend."}</p></div><button className="primary-button" onClick={() => setNotice("Invoice creation will be enabled when the Sales module is connected.")}><span>＋</span> Create invoice</button></div>
          <div className="demo-banner"><span>ⓘ</span><p><strong>Preview mode</strong> — All figures and transactions shown below are illustrative, not live financial data.</p></div>
          {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss">×</button></div>}
          {moduleResources[active] ? <>
            <div className="panel" style={{padding:16,marginBottom:16}}>
              <p style={{fontWeight:600}}>Development workspace identifiers</p>
              <p style={{fontSize:12,marginBottom:12}}>Temporary test IDs. Backend authorization remains mandatory. Not a production workspace selector.</p>
              <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                <label>Tenant ID <input aria-label="Tenant ID" value={tenantId} onChange={e=>setTenantId(e.target.value)} style={{display:"block",padding:8,border:"1px solid #cbd5e1",borderRadius:6,width:330,maxWidth:"100%"}} /></label>
                <label>Branch ID <input aria-label="Branch ID" value={branchId} onChange={e=>setBranchId(e.target.value)} style={{display:"block",padding:8,border:"1px solid #cbd5e1",borderRadius:6,width:330,maxWidth:"100%"}} /></label>
              </div>
            </div>
            <LiveRecords resource={moduleResources[active]} tenantId={tenantId} branchId={branchId}/>
          </> : <>
          <div className="metrics-grid">{metrics.map((metric, index) => <div className="metric-card" key={metric.label}><div className="metric-top"><span>{metric.label}</span><span className={`metric-icon metric-${metric.color}`}>{["↗", "↘", "▤", "◈"][index]}</span></div><strong className="metric-amount">{metric.amount}</strong><div className="metric-bottom"><span className={`metric-change ${metric.trend}`}>{metric.change}</span><span>vs. previous period</span></div></div>)}</div>
          <div className="analytics-grid"><section className="panel chart-panel"><div className="panel-heading"><div><h2>Cash flow overview</h2><p>Track your income and expenses over time</p></div><select aria-label="Chart period" value={period} onChange={e => setPeriod(e.target.value)}><option>Last 6 months</option><option>Last 12 months</option></select></div><div className="chart-legend"><span><i className="legend-revenue" /> Revenue</span><span><i className="legend-expenses" /> Expenses</span></div><div className="chart-area"><div className="chart-y"><span>150k</span><span>100k</span><span>50k</span><span>0</span></div><div className="chart-plot"><div className="chart-grid-lines"><span/><span/><span/><span/></div><div className="chart-bars">{chart.map(point => <div className="chart-column" key={point.month}><div className="bar-pair"><div className="bar revenue-bar" style={{height: `${point.revenue}%`}} title={`Revenue: ${point.revenue}k (illustrative)`}/><div className="bar expense-bar" style={{height: `${point.expenses}%`}} title={`Expenses: ${point.expenses}k (illustrative)`}/></div><span>{point.month}</span></div>)}</div></div></div></section><section className="panel actions-panel"><div className="panel-heading"><div><h2>Quick actions</h2><p>Jump into your daily tasks</p></div></div><div className="quick-actions">{[{icon:"▤",label:"New invoice",description:"Bill a customer"},{icon:"◈",label:"Record expense",description:"Track a purchase"},{icon:"♙",label:"Add customer",description:"Grow your contacts"},{icon:"▧",label:"View reports",description:"Explore insights"}].map(action => <button key={action.label} className="quick-action" onClick={() => setNotice(`${action.label} will be available when its module is connected.`)}><span className="quick-icon">{action.icon}</span><span><strong>{action.label}</strong><small>{action.description}</small></span><span className="quick-arrow">↗</span></button>)}</div><div className="actions-tip"><span>✦</span><p>Stay on top of your finances with one connected workspace.</p></div></section></div>
          <section className="panel transactions-panel"><div className="panel-heading"><div><h2>Recent transactions</h2><p>A snapshot of your latest business activity</p></div><button className="text-button" onClick={() => navigate("Accounting")}>View all transactions →</button></div><div className="table-scroll"><table><thead><tr><th>TRANSACTION</th><th>AMOUNT</th><th>STATUS</th><th>DETAILS</th></tr></thead><tbody>{activity.map(row => <tr key={row.name}><td><div className="transaction-name">{row.name}</div><div className="transaction-detail">{row.detail}</div></td><td className={`transaction-amount ${row.kind}`}>{row.amount}</td><td><span className={`status status-${row.status.toLowerCase()}`}><i/>{row.status}</span></td><td><button className="details-button" onClick={() => setNotice("Transaction details will be available when live data is connected.")}>View ↗</button></td></tr>)}</tbody></table></div></section>
          </>}
          <footer className="page-footer"><span>© 2026 Finatyx. Built for businesses that grow.</span><span>Dashboard preview · Phase 1</span></footer>
        </main>
      </div>
    </div>
  );
}
