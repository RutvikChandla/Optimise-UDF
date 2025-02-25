const { effective_mpa: newEffectiveMpa } = require('./new_function');
const { effective_mpa: oldEffectiveMpa } = require('./old_function');
const { generateLargeDataSet } = require('./generateLargeDataSet');

// Reduce dataset size initially for quick debugging, then increase as needed.
const NUM_RECORDS = 5;

console.log(`Generating test data with ${NUM_RECORDS} records...`);
const data = generateLargeDataSet(NUM_RECORDS);
console.log("Test data generated successfully.");


// Run New Function
console.log("Executing new function...");
console.time("New function execution time");
const resultNew = newEffectiveMpa(
  data.group_id_param,
  data.sub_group_id_param,
  data.created_at_param,
  data.actual_created_at_param,
  data.mpa_param,
  data.table_name_param
);
console.timeEnd("New function execution time");

// Run Old Function
console.log("Executing old function...");
console.time("Old function execution time");
const resultOld = oldEffectiveMpa(
  data.group_id_param,
  data.sub_group_id_param,
  data.created_at_param,
  data.actual_created_at_param,
  data.mpa_param,
  data.table_name_param
);
console.timeEnd("Old function execution time");

// Compare Outputs
console.log("Comparing outputs...");
if (JSON.stringify(resultNew) === JSON.stringify(resultOld)) {
  console.log("✅ Both functions produce identical results!");
} else {
  console.error("❌ Mismatch in function outputs!");
  console.log(`New function output length: ${resultNew.length}`);
  console.log(`Old function output length: ${resultOld.length}`);

  console.log("First 5 results from new function:", resultNew.slice(0, 5));
  console.log("First 5 results from old function:", resultOld.slice(0, 5));
}
