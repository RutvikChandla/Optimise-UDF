function effective_mpa(group_id_param, sub_group_id_param, created_at_param, actual_created_at_param, mpa_param, table_name_param) {
  ////////////////////////////////////////////////////////////////////////////////////
  /*
    Overall Flow:
      1) Collect all rows into an array of events: 
         {created_at, actual_created_at, table_name, sub_group_id, mpa}
  
      2) Sort events by created_at ascending. Also gather:
         - earliest actual_created_at for the group (group_plans_actual_created_at)
         - actual_created_at for each sub_group (subgroup_actual_created_at)
  
      3) Traverse sorted events (forward pass), building a timeline array with:
           {time, group_mpa, sub_groups_mpa (map), ...}
  
         - For group_plans: we update group_mpa whenever we see an event
           from 'group_plans'.
         - For sub_groups: we update sub_groups_mpa[sub_group_id] whenever
           we see an event from 'sub_groups'. If that sub_group was
           not yet created, or if the sub_group's actual creation is after
           'time', we exclude it.
  
         We maintain a 'current' state as we move forward.
  
      4) For each timeline entry, compute group_users_mpa = group_mpa - sum(subgroups).
  
      5) Group by truncated hours. For each truncated hour T, store the
         last-known group_mpa, sub_groups_mpa, etc. up to T.
  
      6) Finally, produce the hour-by-hour result from max back to min, 
         skipping any subgroups or group allocations whose actual_created_at
         is after T.
  
      7) Return an array of JSON strings, as before.
  */
  ////////////////////////////////////////////////////////////////////////////////////
  
  // Utility: roundMinutes, reduceOneHour
  function roundMinutes(date) {
    let d = new Date(date);
    // Round to nearest hour based on minutes
    d.setHours(d.getHours() + Math.round(d.getMinutes() / 60));
    d.setMinutes(0, 0, 0);
    return d;
  }

  function reduceOneHour(date) {
    return new Date(new Date(date).getTime() - 36e5);
  }

  // 1) Build an array of events
  const length = mpa_param.length;
  const events = [];  // holds {time, actual_time, table, subGroupId, mpa}
  let group_plans_actual_created_at = null;
  const subgroup_actual_created_at = {};

  for (let i = 0; i < length; i++) {
    const e = {
      time: created_at_param[i],
      actual_time: actual_created_at_param[i],
      table: table_name_param[i],
      subGroupId: sub_group_id_param[i] || 0,
      mpa: mpa_param[i] || 0
    };
    events.push(e);

    // track group plan earliest actual_created_at
    if (e.table === "group_plans" && e.actual_time != null) {
      if (
        group_plans_actual_created_at == null ||
        new Date(e.actual_time).getTime() < new Date(group_plans_actual_created_at).getTime()
      ) {
        group_plans_actual_created_at = e.actual_time;
      }
    }
    // track sub_group earliest actual_created_at
    if (e.table.includes("sub_group") && e.subGroupId !== 0 && e.actual_time != null) {
      // only store the earliest actual time for each sub group
      if (
        subgroup_actual_created_at[e.subGroupId] == null ||
        new Date(e.actual_time).getTime() < new Date(subgroup_actual_created_at[e.subGroupId]).getTime()
      ) {
        subgroup_actual_created_at[e.subGroupId] = e.actual_time;
      }
    }
  }

  // 2) Sort events by created_at ascending
  events.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  // Identify the overall min and max created_at for iteration boundaries
  if (events.length === 0) {
    return []; // no data => empty result
  }
  const minTimestamp = new Date(events[0].time);
  const maxTimestamp = new Date(events[events.length - 1].time);

  // If group_plans_actual_created_at is null, set it to minTimestamp to avoid errors
  if (!group_plans_actual_created_at) {
    group_plans_actual_created_at = minTimestamp;
  }

  // 3) Build a timeline array in ascending order
  //    We'll keep track of the cumulative group_mpa and sub_groups_mpa as we go.
  let currentGroupMpa = 0;
  let currentSubgroups = {}; // { subGroupId: mpa }
  let timeline = []; // each entry: { time, group_mpa, sub_groups_mpa (clone) }

  // We'll walk through each event in ascending created_at order. 
  // Whenever we reach a new event time, we'll record it with the current state.
  let lastEventTime = null;

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const t = ev.time;
    const tableName = ev.table;
    const sgId = ev.subGroupId;
    const mpaVal = ev.mpa;

    // If we moved to a new time vs. last event time, 
    // push an entry for the old time's state before we update
    if (lastEventTime == null || new Date(t).getTime() !== new Date(lastEventTime).getTime()) {
      // record the state as-of lastEventTime, if it exists
      if (lastEventTime != null) {
        timeline.push({
          time: lastEventTime,
          group_mpa: currentGroupMpa,
          sub_groups_mpa: Object.assign({}, currentSubgroups)
        });
      }
      lastEventTime = t;
    }

    // Now apply the current event
    if (tableName === "group_plans") {
      currentGroupMpa = mpaVal;
    } else {
      // sub_groups
      currentSubgroups[sgId] = mpaVal;
    }
  }

  // push the final event state
  if (lastEventTime != null) {
    timeline.push({
      time: lastEventTime,
      group_mpa: currentGroupMpa,
      sub_groups_mpa: Object.assign({}, currentSubgroups)
    });
  }

  // Now we have a list of "timeline" entries sorted ascending by time. 
  // Next, we fill forward so that each hour between min and max has a known state.
  //
  // 4) Expand into hour-by-hour with truncated hour keys, storing the LAST known
  //    state up to that hour. If no new event, state remains from previous hour.
  const hourlyStates = []; // each: { hourTrunc, group_mpa, sub_groups_mpa }

  let currentIndex = 0; // timeline pointer
  let timelineLen = timeline.length;
  let currentState = {
    group_mpa: 0,
    sub_groups_mpa: {}
  };

  let hourCursor = roundMinutes(minTimestamp);
  const hourEnd = roundMinutes(maxTimestamp);
  // We'll walk hourCursor forward until we exceed hourEnd

  while (hourCursor.getTime() <= hourEnd.getTime()) {
    // while we have timeline[currentIndex] with time <= hourCursor, advance
    while (
      currentIndex < timelineLen &&
      new Date(timeline[currentIndex].time).getTime() <= hourCursor.getTime()
    ) {
      currentState.group_mpa = timeline[currentIndex].group_mpa;
      currentState.sub_groups_mpa = timeline[currentIndex].sub_groups_mpa;
      currentIndex++;
    }
    // record the current state at this hour
    hourlyStates.push({
      hourTrunc: new Date(hourCursor),
      group_mpa: currentState.group_mpa,
      sub_groups_mpa: Object.assign({}, currentState.sub_groups_mpa)
    });

    // move hourCursor ahead by 1 hour
    hourCursor = new Date(hourCursor.getTime() + 36e5);
  }

  // 5) For each hour, we compute group_users_mpa = group_mpa - sum(subgroups).
  //    Then we filter out any group or subgroups whose actual_created_at 
  //    is AFTER that hour (i.e., not yet created).
  //
  // 6) Finally, produce an array of JSON in descending hour order if desired.
  function sumValues(obj) {
    let s = 0;
    for (let k in obj) {
      s += parseInt(obj[k] || 0);
    }
    return s;
  }

  let results = [];
  // We'll go from the last hour down to the first, matching the original code’s final loop
  for (let i = hourlyStates.length - 1; i >= 0; i--) {
    const st = hourlyStates[i];
    let grpMpa = parseInt(st.group_mpa || 0);

    // skip if group_plans_actual_created_at is after this hour
    if (new Date(group_plans_actual_created_at).getTime() > st.hourTrunc.getTime()) {
      // group plan not yet created => skip entire group?
      // The original code checks this in a conditional. We'll skip group row if not created yet.
      continue;
    }

    // compute group_users_mpa by subtracting subgroups
    let totalSubMpa = sumValues(st.sub_groups_mpa);
    let groupUsersMpa = grpMpa - totalSubMpa;
    if (groupUsersMpa < 0) {
      groupUsersMpa = 0;
    }

    // Add the group row
    results.push(JSON.stringify({
      timestamps: st.hourTrunc,
      group_ids: group_id_param[0],
      sub_group_ids: null,
      mpa_sub_group: null,
      mpa_group_user: groupUsersMpa,
      mpa_group: grpMpa
    }));

    // Now add each sub_group row
    for (let sgIdStr in st.sub_groups_mpa) {
      const sgIdNum = parseInt(sgIdStr);
      // skip if the sub group's actual_created_at is after this hour
      if (
        subgroup_actual_created_at[sgIdNum] != null &&
        new Date(subgroup_actual_created_at[sgIdNum]).getTime() > st.hourTrunc.getTime()
      ) {
        continue;
      }
      results.push(JSON.stringify({
        timestamps: st.hourTrunc,
        group_ids: group_id_param[0],
        sub_group_ids: sgIdNum,
        mpa_sub_group: st.sub_groups_mpa[sgIdStr],
        mpa_group_user: groupUsersMpa,
        mpa_group: grpMpa
      }));
    }
  }

  return results;
}

module.exports = { effective_mpa };
