"use strict";
// Focused unit suites exercise existing legacy projection or focus behavior.
// They explicitly model the already-authorized compatibility state; they do
// not qualify backend negotiation. Host/actual-card tests own that boundary.
function isolateLegacyAnalysis(card) {
  card._analysisHostV53={observe:()=>({status:'idle',snapshot:null}),state:()=>({status:'idle',snapshot:null}),
    legacyAllowed:()=>true,mount:()=>{},stop:()=>{},invalidate:()=>{}};
  return card;
}
module.exports={isolateLegacyAnalysis};
