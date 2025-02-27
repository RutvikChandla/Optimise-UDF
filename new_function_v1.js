function effective_mpa(
  group_id_param,
  sub_group_id_param,
  created_at_param,
  actual_created_at_param,
  mpa_param,
  table_name_param
) {
  //////////////////////////////////////////////////////////////////////////
  //  Revised "effective_mpa" so that for each point in time, we store:

  //     -- group_mpa
  //     -- ONE “max” sub_group_mpa
  //     -- sum_subgroups_mpa (for correct groupUsersMpa calculation)

  // We do *not* hold a full map of subgroups in the final timeline array.
  //  Instead, we keep track of them in a dictionary at runtime, then store:
  //    - maxSubgroupId, maxSubgroupMpa
  //    - sumOfAllSubgroups
  //  This way:
  //    groupUsersMpa = group_mpa - sumOfAllSubgroups
  //  is still correct, and we only yield a single subgroup record in final results.
  //
  //////////////////////////////////////////////////////////////////////////

  function roundMinutes(date) {
    let d = new Date(date);
    d.setHours(d.getHours() + Math.round(d.getMinutes() / 60));
    d.setMinutes(0, 0, 0);
    return d;
  }

  function staticGroupMPA(events) {
    // this function will return booleans
    // if see no events from group_plan_versions in the past 1 yr,
    // we will assume that current group mpa is not changed, hence return true. 

    let maxTimestamp = new Date(events[events.length - 1].time);
    let cutoffTimestamp = new Date(maxTimestamp);
    cutoffTimestamp.setFullYear(cutoffTimestamp.getFullYear() - 1);

    let groupPlanVersions = events.filter(e => e.table === "group_plan_versions");
    
    // in group plans, get max created_at
    let maxGrpPlanCreatedAt = null;
    for (let i = 0; i < groupPlanVersions.length; i++) {
      if (maxGrpPlanCreatedAt == null || new Date(groupPlanVersions[i].actual_time).getTime() > new Date(maxGrpPlanCreatedAt).getTime()) {
        maxGrpPlanCreatedAt = groupPlanVersions[i].actual_time;
      }
    }


    return maxGrpPlanCreatedAt == null || new Date(maxGrpPlanCreatedAt).getTime() > cutoffTimestamp.getTime();
  }

  // 1) Build an array of events
  const length = mpa_param.length;
  const events = [];
  let group_plans_actual_created_at = null;
  const subgroup_actual_created_at = {};
  let keepStaticGroupMpa = false;
  let staticGroupMpa;

  for (let i = 0; i < length; i++) {
    const e = {
      time: created_at_param[i],
      actual_time: actual_created_at_param[i],
      table: table_name_param[i],
      subGroupId: sub_group_id_param[i] || 0,
      mpa: mpa_param[i] || 0,
    };
    events.push(e);

    // Track group plan earliest actual_created_at
    if (e.table === "group_plans" && e.actual_time != null) {
      if (
        group_plans_actual_created_at == null ||
        new Date(e.actual_time).getTime() <
          new Date(group_plans_actual_created_at).getTime()
      ) {
        group_plans_actual_created_at = e.actual_time;
      }
      
      // group_plans will be only 1 record, so we can set staticGroupMpa here
      staticGroupMpa = e.mpa;
    }

    // Track sub_group earliest actual_created_at
    if (e.table.includes("sub_group") && e.subGroupId !== 0 && e.actual_time != null) {
      if (
        subgroup_actual_created_at[e.subGroupId] == null ||
        new Date(e.actual_time).getTime() <
          new Date(subgroup_actual_created_at[e.subGroupId]).getTime()
      ) {
        subgroup_actual_created_at[e.subGroupId] = e.actual_time;
      }
    }
  }


  // 2) Sort events by created_at ascending
  events.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  keepStaticGroupMpa = staticGroupMPA(events);

  // If no events, return empty
  if (events.length === 0) {
    return [];
  }

  const minTimestamp = new Date(events[0].time);
  const maxTimestamp = new Date(events[events.length - 1].time);

  // If group_plans_actual_created_at is null, set it to minTimestamp
  if (!group_plans_actual_created_at) {
    group_plans_actual_created_at = minTimestamp;
  }

  // 2b) Define 1-year cutoff from maxTimestamp
  let cutoffTimestamp = new Date(maxTimestamp);
  cutoffTimestamp.setFullYear(cutoffTimestamp.getFullYear() - 1);

  // ----------------------------------------------------------------------
  // 3) Build a timeline array in ascending order
  //    BUT ONLY store the maximum sub-group MPA (and sum) in each timeline entry.
  // ----------------------------------------------------------------------
  let currentGroupMpa = 0;

  // We keep an internal dictionary of subgroups for correct sum & overrides:
  let subGroupMap = {};    // { subGroupId: mpaVal }
  let sumSubgroups = 0;    // track sum of all subgroups
  function insertOrUpdateSubgroup(sgId, newVal) {
    const oldVal = subGroupMap[sgId] || 0;
    // remove oldVal from the sum
    sumSubgroups -= parseInt(oldVal, 10);
    // set newVal
    subGroupMap[sgId] = newVal;
    // add newVal to the sum
    sumSubgroups += parseInt(newVal, 10);;
  }
  function getMaxSubgroupEntry() {
    // Simple O(n) max (could use a max-heap in production for large n):
    let maxVal = 0;
    let maxId = null;
    for (const [idStr, val] of Object.entries(subGroupMap)) {
      if (val > maxVal) {
        maxVal = val;
        maxId = parseInt(idStr, 10);
      }
    }
    return { maxId, maxVal };
  }



  let timeline = [];
  let lastEventTime = null;

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const t = ev.time;
    const tableName = ev.table;
    const sgId = ev.subGroupId;
    const mpaVal = ev.mpa;

    // If we moved to a new timestamp vs. last event time, push the old state's timeline first
    if (lastEventTime == null || new Date(t).getTime() !== new Date(lastEventTime).getTime()) {
      if (lastEventTime != null) {
        // capture current "max" sub-group
        const { maxId, maxVal } = getMaxSubgroupEntry();
        timeline.push({
          time: lastEventTime,
          group_mpa: keepStaticGroupMpa ? staticGroupMpa : currentGroupMpa,
          max_subgroup_id: maxId,
          max_subgroup_mpa: maxVal,
          sum_subgroups_mpa: sumSubgroups
        });
      }
      lastEventTime = t;
    }

    // Apply the current event
    if (tableName.includes("group_plan")) {
      currentGroupMpa = keepStaticGroupMpa ? staticGroupMpa : mpaVal;
    } else if(mpaVal != null) {
      // sub_groups
      insertOrUpdateSubgroup(sgId, mpaVal);
    }
  }

  // Push final event state
  if (lastEventTime != null) {
    const { maxId, maxVal } = getMaxSubgroupEntry();
    timeline.push({
      time: lastEventTime,
      group_mpa: currentGroupMpa,
      max_subgroup_id: maxId,
      max_subgroup_mpa: maxVal,
      sum_subgroups_mpa: sumSubgroups
    });
  }

  // ----------------------------------------------------------------------
  // 4) Expand into hourly states from (cutoffTimestamp) -> (maxTimestamp)
  // ----------------------------------------------------------------------
  const startHour = roundMinutes(
    cutoffTimestamp < minTimestamp ? minTimestamp : cutoffTimestamp
  );
  const endHour = roundMinutes(maxTimestamp);

  let hourlyStates = [];
  let currentIndex = 0;
  let timelineLen = timeline.length;

  // We'll carry a "currentState" for hour-by-hour changes
  let currentState = {
    group_mpa: 0,
    max_subgroup_id: null,
    max_subgroup_mpa: 0,
    sum_subgroups_mpa: 0
  };

  let hourCursor = new Date(startHour);
  while (hourCursor.getTime() <= endHour.getTime()) {
    // move timeline pointer if timeline[currentIndex].time <= hourCursor
    while (
      currentIndex < timelineLen &&
      new Date(timeline[currentIndex].time).getTime() <= hourCursor.getTime()
    ) {
      currentState.group_mpa = timeline[currentIndex].group_mpa;
      currentState.max_subgroup_id = timeline[currentIndex].max_subgroup_id;
      currentState.max_subgroup_mpa = timeline[currentIndex].max_subgroup_mpa;
      currentState.sum_subgroups_mpa = timeline[currentIndex].sum_subgroups_mpa;
      currentIndex++;
    }

    hourlyStates.push({
      hourTrunc: new Date(hourCursor),
      group_mpa: currentState.group_mpa,
      max_subgroup_id: currentState.max_subgroup_id,
      max_subgroup_mpa: currentState.max_subgroup_mpa,
      sum_subgroups_mpa: currentState.sum_subgroups_mpa
    });

    hourCursor = new Date(hourCursor.getTime() + 36e5); // +1 hour
  }

  // ----------------------------------------------------------------------
  // 5) Build final results in descending hour order
  // ----------------------------------------------------------------------
  let results = [];
  for (let i = hourlyStates.length - 1; i >= 0; i--) {
    const st = hourlyStates[i];
    const hourT = st.hourTrunc.getTime();

    // If entire group plan isn't created yet at st.hourTrunc, skip
    if (new Date(group_plans_actual_created_at).getTime() > hourT) {
      continue;
    }

    const grpMpa = parseInt(st.group_mpa || 0, 10);
    const sumSubMpa = parseInt(st.sum_subgroups_mpa || 0, 10);

    // groupUsersMpa is still group_mpa minus the *total* subgroups
    let groupUsersMpa = grpMpa - sumSubMpa;
    if (groupUsersMpa < 0) {
      groupUsersMpa = 0;
    }

    // Single combined record with group + sub-group + group_users
    // You could also split them if you prefer separate lines for sub_group etc.
    results.push(
      JSON.stringify({
        timestamps: st.hourTrunc,
        group_ids: group_id_param[0],
        // The "single" sub-group is the max MPA sub-group at this hour:
        sub_group_ids: st.max_subgroup_id,
        mpa_sub_group: st.max_subgroup_mpa,
        mpa_group_user: groupUsersMpa,
        mpa_group: grpMpa,
      })
    );
  }

  return results;
}

module.exports = { effective_mpa };
