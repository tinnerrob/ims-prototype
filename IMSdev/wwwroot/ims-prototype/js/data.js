/* =========================================================
   IMS — Mock Data Layer
   These JavaScript objects/arrays model the relational tables
   that will back the future SQL schema + Wisej.net UI.
   ========================================================= */
"use strict";

const IMS = {};

/* ---------------------------------------------------------
   TABLE: serialized_assets
   PK asset_id | serial_vin | make | model | category
   meter_hours | fuel_type | purchase_value | base_daily |
   base_weekly | base_monthly | gps_lat | gps_lng | status
   battery_pct | last_reported | contract_id (FK, when on rent)
   --------------------------------------------------------- */
IMS.serializedAssets = [
  { id:"BL-118", serial:"JLG-450AJ-88F2201", make:"JLG", model:"450AJ", category:"Boom Lift", meterHours:1245, fuelType:"Diesel", purchaseValue:145000, baseDaily:450, baseWeekly:2250, baseMonthly:6750, lat:33.7495, lng:-84.3882, status:"Available", battery:92, lastReported:"2026-09-01T08:05:00", contractId:null },
  { id:"BL-119", serial:"JLG-600S-77D3314", make:"JLG", model:"600S", category:"Boom Lift", meterHours:2210, fuelType:"Diesel", purchaseValue:178000, baseDaily:520, baseWeekly:2600, baseMonthly:7800, lat:33.7571, lng:-84.3892, status:"On Rent", battery:78, lastReported:"2026-09-01T08:12:00", contractId:"CT-2024-001" },
  { id:"BL-120", serial:"GEN-S65-12A8870", make:"Genie", model:"S-65", category:"Boom Lift", meterHours:980, fuelType:"Diesel", purchaseValue:156000, baseDaily:480, baseWeekly:2400, baseMonthly:7200, lat:33.7490, lng:-84.3876, status:"Available", battery:88, lastReported:"2026-09-01T07:58:00", contractId:null },
  { id:"SS-204", serial:"BOB-S650-55B1004", make:"Bobcat", model:"S650", category:"Skid Steer", meterHours:4150, fuelType:"Diesel", purchaseValue:62000, baseDaily:265, baseWeekly:1325, baseMonthly:3975, lat:33.7312, lng:-84.4292, status:"On Rent", battery:84, lastReported:"2026-09-01T08:02:00", contractId:"CT-2024-002" },
  { id:"SS-205", serial:"CAT-262D-71C2219", make:"Caterpillar", model:"262D", category:"Skid Steer", meterHours:8400, fuelType:"Diesel", purchaseValue:68000, baseDaily:290, baseWeekly:1450, baseMonthly:4350, lat:33.7492, lng:-84.3878, status:"In Shop", battery:61, lastReported:"2026-09-01T07:40:00", contractId:null },
  { id:"ET-310", serial:"KUB-KX040-99E5540", make:"Kubota", model:"KX040-4", category:"Mini Excavator", meterHours:1730, fuelType:"Diesel", purchaseValue:88000, baseDaily:340, baseWeekly:1700, baseMonthly:5100, lat:33.7497, lng:-84.3888, status:"Staged", battery:95, lastReported:"2026-09-01T08:00:00", contractId:null },
  { id:"ET-311", serial:"CAT-3055-43A0901", make:"Caterpillar", model:"305.5E2", category:"Mini Excavator", meterHours:1490, fuelType:"Diesel", purchaseValue:92000, baseDaily:355, baseWeekly:1775, baseMonthly:5325, lat:33.7488, lng:-84.3872, status:"Available", battery:90, lastReported:"2026-09-01T07:52:00", contractId:null },
  { id:"FL-401", serial:"CAT-EP25-88J6602", make:"Caterpillar", model:"EP25", category:"Forklift", meterHours:3670, fuelType:"Electric", purchaseValue:48000, baseDaily:215, baseWeekly:1075, baseMonthly:3225, lat:33.7553, lng:-84.3912, status:"On Rent", battery:66, lastReported:"2026-09-01T08:08:00", contractId:"CT-2024-001" },
  { id:"FL-402", serial:"TYT-8FGU25-10H8821", make:"Toyota", model:"8FGU25", category:"Forklift", meterHours:2980, fuelType:"LPG", purchaseValue:45000, baseDaily:205, baseWeekly:1025, baseMonthly:3075, lat:33.7493, lng:-84.3884, status:"Available", battery:87, lastReported:"2026-09-01T08:01:00", contractId:null },
  { id:"GN-510", serial:"GEN-100KW-22K1105", make:"Generac", model:"SD100", category:"Generator", meterHours:1220, fuelType:"Diesel", purchaseValue:38000, baseDaily:175, baseWeekly:875, baseMonthly:2625, lat:33.7489, lng:-84.3880, status:"Available", battery:58, lastReported:"2026-09-01T07:47:00", contractId:null },
  { id:"GN-511", serial:"CAT-XQ60-03M7741", make:"Caterpillar", model:"XQ60", category:"Generator", meterHours:2310, fuelType:"Diesel", purchaseValue:29000, baseDaily:135, baseWeekly:675, baseMonthly:2025, lat:33.7206, lng:-84.3611, status:"On Rent", battery:73, lastReported:"2026-09-01T08:04:00", contractId:"CT-2024-003" },
  { id:"TL-605", serial:"JCB-540170-66P9910", make:"JCB", model:"540-170", category:"Telehandler", meterHours:1960, fuelType:"Diesel", purchaseValue:105000, baseDaily:395, baseWeekly:1975, baseMonthly:5925, lat:33.7307, lng:-84.4311, status:"On Rent", battery:81, lastReported:"2026-09-01T08:03:00", contractId:"CT-2024-002" },
  { id:"AB-201", serial:"WAN-VMS812-55A1023", make:"Wanco", model:"VMS-812", category:"Traffic Control", meterHours:410, fuelType:"Solar", purchaseValue:34000, baseDaily:95, baseWeekly:380, baseMonthly:1140, lat:33.7490, lng:-84.3882, status:"Available", battery:71, lastReported:"2026-09-01T07:30:00", contractId:null },
  { id:"GA-610", serial:"IS-MX4-22C5510", make:"Industrial Sci", model:"Ventis MX4", category:"Safety", meterHours:520, fuelType:"Battery", purchaseValue:5200, baseDaily:35, baseWeekly:140, baseMonthly:420, lat:33.7491, lng:-84.3883, status:"Available", battery:88, lastReported:"2026-09-01T07:40:00", contractId:null }
];


/* ---------------------------------------------------------
   TABLE: bulk_resources
   PK sku | name | category | total_owned | qty_available |
   qty_out | base_daily | base_weekly | base_monthly (per unit)
   --------------------------------------------------------- */
IMS.bulkResources = [
  { sku:"SCF-040", name:"Scaffold Frame 4' x 6'", category:"Scaffolding", totalOwned:120, qtyAvailable:78, qtyOut:42, baseDaily:4.50, baseWeekly:18.00, baseMonthly:55.00 },
  { sku:"SCF-080", name:"Scaffold Frame 6' x 10'", category:"Scaffolding", totalOwned:85, qtyAvailable:40, qtyOut:45, baseDaily:6.50, baseWeekly:26.00, baseMonthly:78.00 },
  { sku:"PLK-014", name:"Scaffold Plank 14 ft", category:"Scaffolding", totalOwned:60, qtyAvailable:60, qtyOut:0, baseDaily:3.00, baseWeekly:12.00, baseMonthly:36.00 },
  { sku:"CN-018", name:"Traffic Cone 28 in", category:"Traffic", totalOwned:300, qtyAvailable:180, qtyOut:120, baseDaily:0.75, baseWeekly:3.25, baseMonthly:9.00 },
  { sku:"BR-010", name:"Water Barrier 10 ft", category:"Traffic", totalOwned:90, qtyAvailable:55, qtyOut:35, baseDaily:5.00, baseWeekly:20.00, baseMonthly:60.00 },
  { sku:"SHG-020", name:"Trench Shoring Beam", category:"Shoring", totalOwned:25, qtyAvailable:25, qtyOut:0, baseDaily:9.50, baseWeekly:38.00, baseMonthly:114.00 },
  { sku:"SB-005", name:"Sandbag (50 lb)", category:"Traffic", totalOwned:400, qtyAvailable:400, qtyOut:0, baseDaily:0.50, baseWeekly:2.50, baseMonthly:7.50 },
  { sku:"TR-030", name:"Confined Space Tripod", category:"Safety", totalOwned:15, qtyAvailable:15, qtyOut:0, baseDaily:18.00, baseWeekly:72.00, baseMonthly:216.00 },
  { sku:"FLH-001", name:"Full Body Harness", category:"Safety", totalOwned:40, qtyAvailable:40, qtyOut:0, baseDaily:6.00, baseWeekly:24.00, baseMonthly:72.00 },
  { sku:"LS-002", name:"Shock-Absorbing Lanyard", category:"Safety", totalOwned:40, qtyAvailable:40, qtyOut:0, baseDaily:5.00, baseWeekly:20.00, baseMonthly:60.00 }
];

/* ---------------------------------------------------------
   TABLE: consumables
   PK sku | name | qty_on_hand | reorder_point | cost_price |
   retail_price
   --------------------------------------------------------- */
IMS.consumables = [
  { sku:"SG-LFT-001", name:"Lifting Gloves (pair)", category:"Safety", qtyOnHand:240, reorderPoint:60, costPrice:2.10, retailPrice:5.50 },
  { sku:"SG-NS-002", name:"Nitrile Gloves (box)", category:"Safety", qtyOnHand:120, reorderPoint:40, costPrice:3.40, retailPrice:8.25 },
  { sku:"FL-HYD-010", name:"Hydraulic Fluid 5 gal", category:"Fluids", qtyOnHand:36, reorderPoint:12, costPrice:42.00, retailPrice:78.00 },
  { sku:"FL-DSL-005", name:"DEF Fluid 2.5 gal", category:"Fluids", qtyOnHand:55, reorderPoint:15, costPrice:14.50, retailPrice:26.00 },
  { sku:"HW-HLM-003", name:"Hard Hat", category:"Safety", qtyOnHand:48, reorderPoint:20, costPrice:11.00, retailPrice:22.00 },
  { sku:"VST-VES-001", name:"Hi-Vis Safety Vest", category:"Safety", qtyOnHand:90, reorderPoint:25, costPrice:6.20, retailPrice:14.50 },
  { sku:"BP-ENG-020", name:"Engine Oil 15W-40 (gal)", category:"Fluids", qtyOnHand:44, reorderPoint:16, costPrice:16.80, retailPrice:31.00 },
  { sku:"GN-GRL-001", name:"Grease Cartridge", category:"Fluids", qtyOnHand:32, reorderPoint:10, costPrice:4.90, retailPrice:9.75 }
];

/* ---------------------------------------------------------
   TABLE: labor_employees
   PK emp_id | full_name | role | certifications |
   hourly_cost_rate | hourly_billable_rate
   --------------------------------------------------------- */
IMS.labor = [
  { empId:"EMP-001", name:"Marcus Webb", role:"Operator", category:"Field", certs:["OSHA 30", "AWP"], hourlyCost:28, hourlyBillable:68 },
  { empId:"EMP-002", name:"Dana Cho", role:"Technician", category:"Shop", certs:["Forklift", "Electrical"], hourlyCost:32, hourlyBillable:75 },
  { empId:"EMP-003", name:"Luis Ortega", role:"CDL Driver", category:"Dispatch", certs:["CDL Class A"], hourlyCost:27, hourlyBillable:62 },
  { empId:"EMP-004", name:"Priya Nair", role:"Operator", category:"Field", certs:["OSHA 30", "Telehandler"], hourlyCost:30, hourlyBillable:72 },
  { empId:"EMP-005", name:"Sam Kovac", role:"Technician", category:"Shop", certs:["Welding", "Hydraulics"], hourlyCost:34, hourlyBillable:80 },
  { empId:"EMP-006", name:"Rita Gomez", role:"Operator", category:"Field", certs:["Forklift"], hourlyCost:24, hourlyBillable:58 }
];


/* ---------------------------------------------------------
   TABLE: service_parts (Stock Inventory - shop use only)
   PK part_id | description | bin | qty_on_hand | reorder_point |
   cost_price | active
   --------------------------------------------------------- */
IMS.parts = [
  { partId:"PRT-001", description:"Hydraulic Filter 40um", category:"Filters", bin:"A-03", qtyOnHand:24, reorderPoint:6, costPrice:18.50, active:true },
  { partId:"PRT-002", description:"Air Filter Element", category:"Filters", bin:"A-07", qtyOnHand:18, reorderPoint:5, costPrice:22.00, active:true },
  { partId:"PRT-003", description:"Fuel Filter Assembly", category:"Filters", bin:"B-01", qtyOnHand:30, reorderPoint:8, costPrice:14.75, active:true },
  { partId:"PRT-004", description:"Grease Fitting Kit", category:"Hardware", bin:"B-12", qtyOnHand:60, reorderPoint:20, costPrice:6.40, active:true },
  { partId:"PRT-005", description:"Hydraulic Hose 1in x 6ft", category:"Hoses", bin:"C-04", qtyOnHand:12, reorderPoint:4, costPrice:34.00, active:true },
  { partId:"PRT-006", description:"Track Pin & Bushing Set", category:"Hydraulics", bin:"D-02", qtyOnHand:8, reorderPoint:2, costPrice:120.00, active:true }
];

/* ---------------------------------------------------------
   TABLE: customers
   PK cust_id | name | contact | phone | email | billing |
   notes
   --------------------------------------------------------- */
IMS.customers = [
  { id:"CUST-001", name:"Halstead Construction", contact:"M. Halstead", phone:"(404) 555-0134", email:"projects@halstead.com", billingAddress:"100 Peachtree Pkwy NE, Atlanta, GA", billingCycle:"weekly", notes:"Boom & aerial work; weekly cadence." },
  { id:"CUST-002", name:"Meridian Civil Works", contact:"L. Bishop", phone:"(678) 555-0192", email:"ops@meridiancivil.com", billingAddress:"88 River Rd, Atlanta, GA", billingCycle:"bi-weekly", notes:"Bridge / heavy civil. Net-30 terms." },
  { id:"CUST-003", name:"Coastal Energy Group", contact:"R. Vance", phone:"(404) 555-0117", email:"supply@coastalenergy.com", billingAddress:"1 Fuel Pier, Savannah, GA", billingCycle:"monthly", notes:"Refinery/hazmat; risk premium applies." },
  { id:"CUST-004", name:"Port Authority", contact:"T. Nguyen", phone:"(912) 555-0165", email:"facilities@portauthority.gov", billingAddress:"Terminal Way, Savannah, GA", billingCycle:"quarterly", notes:"Public works; coastal surcharge." },
  { id:"CUST-005", name:"Brightleaf General Contracting", contact:"S. Rawlins", phone:"(770) 555-0149", email:"pm@brightleafgc.com", billingAddress:"1200 Piedmont Ave, Atlanta, GA", billingCycle:"monthly", notes:"Small jobs; no active contracts." }
];

/* ---------------------------------------------------------
   TABLE: contracts
   PK contract_id | cust_id (FK) | job_site | geofence_radius_m |
   project_name | start_dt | end_dt | status | site_lat |
   site_lng | line_items[]  (child table)
   --------------------------------------------------------- */
IMS.yard = { name:"Main Yard — Buckhead Hub", lat:33.7490, lng:-84.3880 };

IMS.contracts = [
  {
    contractId:"CT-2024-001", customerId:"CUST-001", customer:"Halstead Construction", jobSite:"Downtown Plaza, 245 Peachtree St",
    geofenceRadius:300, projectName:"Downtown Plaza Renovation",
    startDate:"2026-08-20T07:00", endDate:"2026-09-10T17:00", status:"active",
    siteLat:33.7560, siteLng:-84.3905,
    lineItems:[
      { id:"LI-101", type:"serialized", refId:"BL-119", qty:1, pricingMatrix:"standard", weekendPolicy:"bill", riskPremium:"standard", flatTotal:0 },
      { id:"LI-102", type:"serialized", refId:"FL-401", qty:1, pricingMatrix:"standard", weekendPolicy:"bill", riskPremium:"standard", flatTotal:0 },
      { id:"LI-103", type:"bulk", refId:"CN-018", qty:50, pricingMatrix:"standard", weekendPolicy:"bill", riskPremium:"standard", flatTotal:0 },
      { id:"LI-104", type:"consumable", refId:"SG-LFT-001", qty:20, pricingMatrix:"standard", weekendPolicy:"bill", riskPremium:"standard", flatTotal:0 },
      { id:"LI-105", type:"labor", refId:"EMP-001", qty:40, pricingMatrix:"flat", weekendPolicy:"bill", riskPremium:"standard", flatTotal:0 }
    ]
  },
  {
    contractId:"CT-2024-002", customerId:"CUST-002", customer:"Meridian Civil Works", jobSite:"Riverside Bridge, 88 River Rd",
    geofenceRadius:500, projectName:"Riverside Bridge Repair",
    startDate:"2026-09-01T06:30", endDate:"2026-09-20T17:30", status:"active",
    siteLat:33.7310, siteLng:-84.4300,
    lineItems:[
      { id:"LI-201", type:"serialized", refId:"SS-204", qty:1, pricingMatrix:"standard", weekendPolicy:"skip", riskPremium:"standard", flatTotal:0 },
      { id:"LI-202", type:"serialized", refId:"TL-605", qty:1, pricingMatrix:"standard", weekendPolicy:"skip", riskPremium:"standard", flatTotal:0 },
      { id:"LI-203", type:"bulk", refId:"SCF-040", qty:30, pricingMatrix:"standard", weekendPolicy:"skip", riskPremium:"standard", flatTotal:0 },
      { id:"LI-204", type:"labor", refId:"EMP-003", qty:24, pricingMatrix:"flat", weekendPolicy:"bill", riskPremium:"standard", flatTotal:0 }
    ]
  },
  {
    contractId:"CT-2024-003", customerId:"CUST-003", customer:"Coastal Energy Group", jobSite:"Bayport Refinery, 1 Fuel Pier",
    geofenceRadius:400, projectName:"Refinery Catalyst Swap",
    startDate:"2026-09-02T05:00", endDate:"2026-09-30T17:00", status:"active",
    siteLat:33.7200, siteLng:-84.3600,
    lineItems:[
      { id:"LI-301", type:"serialized", refId:"GN-511", qty:1, pricingMatrix:"standard", weekendPolicy:"overtime", riskPremium:"hazmat", flatTotal:0 },
      { id:"LI-302", type:"bulk", refId:"BR-010", qty:20, pricingMatrix:"standard", weekendPolicy:"overtime", riskPremium:"hazmat", flatTotal:0 },
      { id:"LI-303", type:"consumable", refId:"FL-DSL-005", qty:8, pricingMatrix:"standard", weekendPolicy:"bill", riskPremium:"standard", flatTotal:0 },
      { id:"LI-304", type:"labor", refId:"EMP-002", qty:30, pricingMatrix:"flat", weekendPolicy:"bill", riskPremium:"standard", flatTotal:0 }
    ]
  },
  {
    contractId:"CT-2024-004", customerId:"CUST-004", customer:"Port Authority", jobSite:"Pier 12 Bulkhead, Terminal Way",
    geofenceRadius:250, projectName:"Pier 12 Bulkhead Repair",
    startDate:"2026-08-01T07:00", endDate:"2026-08-25T17:00", status:"closed",
    siteLat:33.7420, siteLng:-84.3520,
    lineItems:[
      { id:"LI-401", type:"serialized", refId:"ET-310", qty:1, pricingMatrix:"standard", weekendPolicy:"bill", riskPremium:"coastal", flatTotal:0 }
    ]
  }
];

/* ---------------------------------------------------------
   TABLE: work_orders
   PK wo_id | asset_id (FK) | service_type | meter_reading |
   status | parts[] (child) | labor_hours | parts_cost |
   labor_cost | total_cost | date
   --------------------------------------------------------- */
IMS.workOrders = [
  { woId:"WO-401", assetId:"SS-205", type:"Repair", meterReading:8400, status:"In Progress", parts:[{sku:"FL-HYD-010",qty:2}], laborHours:3, date:"2026-08-30" },
  { woId:"WO-402", assetId:"GN-510", type:"Preventive", meterReading:1220, status:"Completed", parts:[{sku:"BP-ENG-020",qty:2},{sku:"GN-GRL-001",qty:2}], laborHours:1.5, date:"2026-08-28" },
  { woId:"WO-403", assetId:"BL-120", type:"Inspection", meterReading:3200, status:"Completed", parts:[], laborHours:1, date:"2026-08-25" },
  { woId:"WO-404", assetId:"FL-402", type:"Repair", meterReading:2980, status:"Scheduled", parts:[{sku:"BP-ENG-020",qty:1}], laborHours:2, date:"2026-09-01" }
];

/* ---------------------------------------------------------
   TABLE: timesheets
   PK ts_id | emp_id (FK) | work_date | hours | target_type |
   target_id | cost_rate | billable_rate
   --------------------------------------------------------- */
IMS.timesheets = [
  /* 2026-08-31 (Monday) */
  { tsId:"TS-001", empId:"EMP-001", date:"2026-08-31", clockIn:"07:00", clockOut:"11:30", hours:4.5, targetType:"contract", targetId:"CT-2024-001" },
  { tsId:"TS-002", empId:"EMP-001", date:"2026-08-31", clockIn:"11:30", clockOut:"12:30", hours:1,   targetType:"overhead", targetId:null },
  { tsId:"TS-003", empId:"EMP-001", date:"2026-08-31", clockIn:"12:30", clockOut:"16:00", hours:3.5, targetType:"contract", targetId:"CT-2024-001" },
  { tsId:"TS-004", empId:"EMP-002", date:"2026-08-31", clockIn:"08:00", clockOut:"12:00", hours:4,   targetType:"workorder", targetId:"WO-402" },
  { tsId:"TS-005", empId:"EMP-002", date:"2026-08-31", clockIn:"12:30", clockOut:"16:30", hours:4,   targetType:"workorder", targetId:"WO-402" },
  { tsId:"TS-006", empId:"EMP-005", date:"2026-08-31", clockIn:"09:00", clockOut:"12:00", hours:3,   targetType:"workorder", targetId:"WO-401" },
  { tsId:"TS-007", empId:"EMP-005", date:"2026-08-31", clockIn:"13:00", clockOut:"15:00", hours:2,   targetType:"idle", targetId:null },
  /* 2026-09-01 (Tuesday) */
  { tsId:"TS-008", empId:"EMP-001", date:"2026-09-01", clockIn:"07:00", clockOut:"12:00", hours:5,   targetType:"contract", targetId:"CT-2024-001" },
  { tsId:"TS-009", empId:"EMP-001", date:"2026-09-01", clockIn:"12:00", clockOut:"13:00", hours:1,   targetType:"idle", targetId:null },
  { tsId:"TS-010", empId:"EMP-001", date:"2026-09-01", clockIn:"13:00", clockOut:"17:00", hours:4,   targetType:"contract", targetId:"CT-2024-001" },
  { tsId:"TS-011", empId:"EMP-002", date:"2026-09-01", clockIn:"08:00", clockOut:"12:00", hours:4,   targetType:"workorder", targetId:"WO-401" },
  { tsId:"TS-012", empId:"EMP-002", date:"2026-09-01", clockIn:"13:00", clockOut:"17:00", hours:4,   targetType:"shop", targetId:null },
  { tsId:"TS-013", empId:"EMP-003", date:"2026-09-01", clockIn:"06:30", clockOut:"10:30", hours:4,   targetType:"contract", targetId:"CT-2024-002" },
  { tsId:"TS-014", empId:"EMP-003", date:"2026-09-01", clockIn:"10:30", clockOut:"11:30", hours:1,   targetType:"overhead", targetId:null },
  { tsId:"TS-015", empId:"EMP-003", date:"2026-09-01", clockIn:"11:30", clockOut:"14:30", hours:3,   targetType:"contract", targetId:"CT-2024-002" },
  { tsId:"TS-016", empId:"EMP-004", date:"2026-09-01", clockIn:"07:00", clockOut:"12:00", hours:5,   targetType:"contract", targetId:"CT-2024-001" },
  { tsId:"TS-017", empId:"EMP-004", date:"2026-09-01", clockIn:"12:00", clockOut:"13:00", hours:1,   targetType:"idle", targetId:null },
  { tsId:"TS-018", empId:"EMP-004", date:"2026-09-01", clockIn:"13:00", clockOut:"16:00", hours:3,   targetType:"contract", targetId:"CT-2024-001" },
  { tsId:"TS-019", empId:"EMP-005", date:"2026-09-01", clockIn:"08:00", clockOut:"12:00", hours:4,   targetType:"workorder", targetId:"WO-404" },
  { tsId:"TS-020", empId:"EMP-005", date:"2026-09-01", clockIn:"13:00", clockOut:"17:00", hours:4,   targetType:"shop", targetId:null },
  { tsId:"TS-021", empId:"EMP-006", date:"2026-09-01", clockIn:"08:00", clockOut:"12:00", hours:4,   targetType:"contract", targetId:"CT-2024-001" },
  { tsId:"TS-022", empId:"EMP-006", date:"2026-09-01", clockIn:"12:00", clockOut:"13:00", hours:1,   targetType:"idle", targetId:null },
  { tsId:"TS-023", empId:"EMP-006", date:"2026-09-01", clockIn:"13:00", clockOut:"16:00", hours:3,   targetType:"contract", targetId:"CT-2024-001" }
];

/* ---------------------------------------------------------
   TABLE: kits / assemblies (parent)
   PK kit_id | name | base_rate | components[] (child: ref)
   --------------------------------------------------------- */
IMS.kits = [
  { kitId:"KT-001", name:"Traffic Control Kit", baseRate:185, qtyOwned:8, components:[
      { refType:"serialized", refId:"AB-201", qty:1 },
      { refType:"bulk", refId:"CN-018", qty:20 },
      { refType:"bulk", refId:"SB-005", qty:4 }
    ]},
  { kitId:"KT-002", name:"Confined Space Entry Kit", baseRate:260, qtyOwned:4, components:[
      { refType:"serialized", refId:"GA-610", qty:1 },
      { refType:"bulk", refId:"TR-030", qty:2 }
    ]},
  { kitId:"KT-003", name:"Fall Protection Kit", baseRate:120, qtyOwned:10, components:[
      { refType:"bulk", refId:"FLH-001", qty:6 },
      { refType:"bulk", refId:"LS-002", qty:6 }
    ]}
];

/* ---------------------------------------------------------
   TABLE: attachments / accessories (parent)
   PK acc_id | name | category | fits[] | qty_owned | daily
   TABLE: asset_attachments (cross-mapping FK)
   --------------------------------------------------------- */
IMS.attachments = [
  { accId:"ACC-001", name:'24" Digging Bucket', category:"Bucket", fits:["ET-310","ET-311"], qtyOwned:6, daily:45 },
  { accId:"ACC-002", name:'36" Ditch Bucket', category:"Bucket", fits:["ET-310","ET-311"], qtyOwned:3, daily:55 },
  { accId:"ACC-003", name:"Fork Carriage 48 in", category:"Carriage", fits:["TL-605","FL-401"], qtyOwned:4, daily:38 },
  { accId:"ACC-004", name:"Work Platform Cage", category:"Platform", fits:["BL-118","BL-119","BL-120"], qtyOwned:5, daily:60 },
  { accId:"ACC-005", name:"Breaker Attachment", category:"Hydraulic", fits:["ET-310"], qtyOwned:2, daily:90 }
];
IMS.assetAttachments = [
  { assetId:"ET-310", accId:"ACC-001", qty:1 },
  { assetId:"ET-310", accId:"ACC-002", qty:1 },
  { assetId:"ET-311", accId:"ACC-001", qty:1 },
  { assetId:"TL-605", accId:"ACC-003", qty:1 },
  { assetId:"FL-401", accId:"ACC-003", qty:1 },
  { assetId:"BL-119", accId:"ACC-004", qty:1 }
];

/* ---------------------------------------------------------
   TABLE: vehicles (transport assets)
   --------------------------------------------------------- */
IMS.vehicles = [
  { truckId:"TRK-01", name:"Freightliner M2 26 ft", plate:"ABC-4521", status:"Available" },
  { truckId:"TRK-02", name:"F-550 Flatbed", plate:"XYZ-7789", status:"En Route" },
  { truckId:"TRK-03", name:"Isuzu NPR Box", plate:"QRS-9912", status:"Available" }
];

/* ---------------------------------------------------------
   TABLE: inspections (yard in/out)
   PK insp_id | asset_id | contract_id | direction | date |
   meter_out | meter_in | fuel_out | fuel_in | checks{} |
   photos | status
   --------------------------------------------------------- */
IMS.inspections = [
  { inspId:"INSP-001", assetId:"BL-119", contractId:"CT-2024-001", direction:"Check-Out", date:"2026-08-20", meterOut:2210, meterIn:null, fuelOut:85, fuelIn:null, checks:{tires:true,fluids:true,guards:true,lights:true,engine:true}, photos:2, status:"Open" },
  { inspId:"INSP-002", assetId:"SS-204", contractId:"CT-2024-002", direction:"Check-Out", date:"2026-09-01", meterOut:4150, meterIn:null, fuelOut:78, fuelIn:null, checks:{tires:true,fluids:true,guards:true,lights:false,engine:true}, photos:1, status:"Open" },
  { inspId:"INSP-003", assetId:"BL-120", contractId:null, direction:"Check-In", date:"2026-08-28", meterOut:3190, meterIn:3200, fuelOut:60, fuelIn:40, checks:{tires:true,fluids:true,guards:true,lights:true,engine:true}, photos:3, status:"Closed" }
];

/* ---------------------------------------------------------
   TABLE: dispatches (logistics)
   PK dispatch_id | contract_id | asset_id | route_seq |
   driver_id | truck_id | status
   --------------------------------------------------------- */
IMS.dispatches = [
  { dispatchId:"DSP-001", contractId:"CT-2024-001", assetId:"BL-119", routeSeq:1, driverId:"EMP-003", truckId:"TRK-01", status:"En Route" },
  { dispatchId:"DSP-002", contractId:"CT-2024-001", assetId:"FL-401", routeSeq:2, driverId:null, truckId:null, status:"Staged" },
  { dispatchId:"DSP-003", contractId:"CT-2024-002", assetId:"SS-204", routeSeq:3, driverId:"EMP-001", truckId:"TRK-02", status:"Delivered" },
  { dispatchId:"DSP-004", contractId:"CT-2024-002", assetId:"TL-605", routeSeq:4, driverId:null, truckId:null, status:"Staged" },
  { dispatchId:"DSP-005", contractId:"CT-2024-003", assetId:"GN-511", routeSeq:5, driverId:"EMP-003", truckId:"TRK-01", status:"Pending Return" }
];

/* ---------------------------------------------------------
   TABLE: cycle_invoices
   PK inv_id | contract_id | cycle | cycle_start | cycle_end |
   env_fee_pct | damage_waiver | fuel_charge | status (pending|invoiced|paid)
   --------------------------------------------------------- */
IMS.invoices = [
  { invId:"INV-001", contractId:"CT-2024-001", cycle:1, cycleStart:"2026-08-20", cycleEnd:"2026-08-27", envFeePct:5, damageWaiver:false, fuelCharge:120, taxRate:0.08, status:"invoiced" },
  { invId:"INV-002", contractId:"CT-2024-002", cycle:1, cycleStart:"2026-09-01", cycleEnd:"2026-09-15", envFeePct:5, damageWaiver:true, fuelCharge:0, taxRate:0.07, status:"pending" },
  { invId:"INV-003", contractId:"CT-2024-003", cycle:1, cycleStart:"2026-09-02", cycleEnd:"2026-09-30", envFeePct:7, damageWaiver:true, fuelCharge:210, taxRate:0.07, status:"paid" }
];

/* ---------------------------------------------------------
   TABLE: re_rents (sub-rental from third-party vendors)
   PK rr_id | asset_id | asset_name | contract_id | vendor |
   vendor_cost | retail_rate | qty
   --------------------------------------------------------- */
IMS.rentals = [
  { rrId:"RR-001", assetId:"GN-510", assetName:"Generac 100 kW Generator", contractId:"CT-2024-003", vendor:"PowerGen Rentals", vendorCost:110, retailRate:175, qty:1 },
  { rrId:"RR-002", assetId:"FL-402", assetName:"Toyota Forklift 8FGU25", contractId:"CT-2024-004", vendor:"Forklift Fleet Co", vendorCost:95, retailRate:205, qty:1 },
  { rrId:"RR-003", assetId:null, assetName:"Compaction Roller 5T", contractId:"CT-2024-002", vendor:"Meridian Tools Supply", vendorCost:140, retailRate:260, qty:1 }
];

/* ---------------------------------------------------------
   TABLE: system_settings (branches, taxes, pricing engine)
   --------------------------------------------------------- */
IMS.settings = {
  branches: [
    { branchId:"BR-ATL", name:"Atlanta Main", address:"1200 Logistics Dr, Atlanta GA", phone:"(404) 555-0100", tz:"America/New_York" },
    { branchId:"BR-SAV", name:"Savannah Port", address:"8 Terminal Way, Savannah GA", phone:"(912) 555-0177", tz:"America/New_York" }
  ],
  taxSchedules: [
    { code:"GA", state:"Georgia", county:"Fulton", city:"Atlanta", rate:0.08, note:"State + county combined" },
    { code:"AL", state:"Alabama", county:"", city:"", rate:0.07, note:"Standard state rate" },
    { code:"TN", state:"Tennessee", county:"Davidson", city:"Nashville", rate:0.0925, note:"Highest local rate" }
  ],
  categories: {
    serialized: [
      { name:"Boom Lift", active:true }, { name:"Skid Steer", active:true }, { name:"Mini Excavator", active:true },
      { name:"Forklift", active:true }, { name:"Generator", active:true }, { name:"Telehandler", active:true },
      { name:"Compressor", active:true }, { name:"Light Tower", active:true }, { name:"Traffic Control", active:true }, { name:"Safety", active:true }
    ],
    bulk: [
      { name:"Scaffolding", active:true }, { name:"Traffic", active:true }, { name:"Shoring", active:true },
      { name:"Concrete", active:true }, { name:"Safety", active:true }
    ],
    consumable: [
      { name:"Safety", active:true }, { name:"Fluids", active:true }, { name:"Hardware", active:true }, { name:"General", active:true }
    ],
    labor: [
      { name:"Field", active:true }, { name:"Shop", active:true }, { name:"Dispatch", active:true }
    ],
    parts: [
      { name:"Filters", active:true }, { name:"Hoses", active:true }, { name:"Hydraulics", active:true },
      { name:"Hardware", active:true }, { name:"Electrical", active:true }
    ]
  },
  overheads: [
    { ohId:"OH-ENV", name:"Environmental Fee Surcharge", category:"Freight/Logistics", chargeType:"Percent of Equipment Total", cost:0, retail:0, pct:2.5, locked:true },
    { ohId:"OH-MOB", name:"Standard Mobilization / Delivery", category:"Freight/Logistics", chargeType:"Flat Fee", cost:150, retail:250, pct:0, locked:true },
    { ohId:"OH-PMT", name:"Oversized Transport Permit", category:"Compliance", chargeType:"Flat Fee", cost:75, retail:110, pct:0, locked:false },
    { ohId:"OH-STR", name:"Warehouse Storage Slot B", category:"Facility", chargeType:"Per Day", cost:40, retail:95, pct:0, locked:false }
  ],
  pricing: {
    dailyMinHours:8,
    weeklyHours:40,
    cycleDays:28,
    weekendPolicyDefault:"bill",
    riskPremiums:{ standard:0, coastal:0.15, hazmat:0.25 },
    envFeePct:5,
    depreciationAnnual:0.10
  }
};
