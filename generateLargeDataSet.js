/**
 * Utility to return a random timestamp on Jan 1st, 2023, after 00:00:00Z.
 */
function randomTimeOnJan1() {
  const startMs = new Date("2023-01-01T00:00:01Z").getTime(); // 1 second after midnight
  const endMs = new Date("2023-01-01T06:01:00Z").getTime();
  const randomMs = Math.floor(Math.random() * (endMs - startMs + 1)) + startMs;
  return new Date(randomMs).toISOString();
}

/**
 * Generates test data ensuring:
 *  - `mpa` for "group_plans" never exceeds the highest `mpa` for "sub_groups".
 */
function generateLargeDataSet(numRecords) {
  const data = [];

  // 1) Always create exactly 1 group plan at midnight:
  data.push({
    id: 1,
    group_id: 1,
    sub_group_id: null,
    created_at: "2023-01-01T00:00:00Z",
    actual_created_at: "2023-01-01T00:00:00Z",
    mpa: Math.floor(Math.random() * 101), // Temp value, will be clamped later
    table_name: "group_plans"
  });

  let maxSubGroupMPA = 0; // Track max MPA of sub_groups

  // 2) Generate remaining records, ensuring `group_plans` has an MPA <= maxSubGroupMPA
  for (let i = 2; i <= numRecords; i++) {
    const isSubgroup = Math.random() < 0.5; // 50% chance of being "sub_groups"
    const createdAt = randomTimeOnJan1();

    let actualCreatedAt = null;
    let subGroupID = null;
    let mpaValue = Math.floor(Math.random() * 101); // Random MPA

    if (isSubgroup) {
      // sub_groups => actual_created_at == created_at
      actualCreatedAt = createdAt;
      subGroupID = Math.floor(Math.random() * 1000) + 1;
      maxSubGroupMPA = Math.max(maxSubGroupMPA, mpaValue);
    }

    data.push({
      id: i,
      group_id: 1,
      sub_group_id: subGroupID,
      created_at: createdAt,
      actual_created_at: actualCreatedAt,
      mpa: mpaValue,
      table_name: isSubgroup ? "sub_groups" : "sub_group_versions"
    });
  }

  // 3) Sort everything by created_at, then by ID
  data.sort((a, b) => {
    const tA = new Date(a.created_at).getTime();
    const tB = new Date(b.created_at).getTime();
    return tA !== tB ? tA - tB : a.id - b.id;
  });

  // 4) Ensure "group_plans" MPA is clamped to maxSubGroupMPA
  if (maxSubGroupMPA > 0) {
    data[0].mpa = Math.min(data[0].mpa, maxSubGroupMPA);
  }

  // 5) Convert to final arrays
  const group_id_param = [];
  const sub_group_id_param = [];
  const created_at_param = [];
  const actual_created_at_param = [];
  const mpa_param = [];
  const table_name_param = [];

  for (const row of data) {
    group_id_param.push(row.group_id);
    sub_group_id_param.push(row.sub_group_id);
    created_at_param.push(row.created_at);
    actual_created_at_param.push(row.actual_created_at);
    mpa_param.push(row.mpa);
    table_name_param.push(row.table_name);
  }

  const result = {
    group_id_param,
    sub_group_id_param,
    created_at_param,
    actual_created_at_param,
    mpa_param,
    table_name_param
  };

  // console.log("Generated Input:", result);
  return result;
}

module.exports = { generateLargeDataSet };
