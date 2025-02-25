function effective_mpa(group_id_param, sub_group_id_param, created_at_param, actual_created_at_param, mpa_param, table_name_param) {
      //Declaring required varaibles at global level
      var length = mpa_param.length;
      var return_data=[];
      var timestamps = {};
      var transformed_data = {};
      // Transforming data in a better format
      //
      // Sample -> {
      //  group_plans: {
      //    2020-05-07 07:57:50 UTC: null,
      //    2020-05-07 08:40:26 UTC: 5
      //  },
      //  sub_groups: {
      //    2020-05-07 07:57:50 UTC: {
      //      1597: null
      //    },
      //    2020-05-07 08:40:26 UTC: {
      //      1597: null
      //    },
      //    2020-05-07 08:41:05 UTC: {
      //      1597: 1,
      //      1598: 3,
      //      1599: null
      //    },
      //    2020-05-07 08:41:32 UTC: {
      //      1597: 1
      //    }
      //  }
      // }
      //
      transformed_data.sub_groups = {};
      transformed_data.group_plans = {};
      // subgroup_actual_created_at & group_plans_actual_created_at store the actual created at values for subgroup/group creation
      var subgroup_actual_created_at = {};
      var group_plans_actual_created_at = null;
      for(var i=0;i<length;i++) {
        if(actual_created_at_param[i]!=null && table_name_param[i] == "group_plans")
          group_plans_actual_created_at = actual_created_at_param[i];
        if(actual_created_at_param[i]!=null && table_name_param[i] == "sub_groups")
          subgroup_actual_created_at[sub_group_id_param[i]] = actual_created_at_param[i];
      }
      for(var i=0; i<length; i++){
        var created_at = created_at_param[i];
        var sub_group_id = sub_group_id_param[i];
        if (sub_group_id == null) sub_group_id = 0;
        var mpa = mpa_param[i];
        if(table_name_param[i].includes("sub_group")){
          if(transformed_data.sub_groups[created_at] === undefined) transformed_data.sub_groups[created_at] = {};
          transformed_data.sub_groups[created_at][sub_group_id] = mpa;
        } else {
          transformed_data.group_plans[created_at] = mpa;
          transformed_data.group_plans[created_at]
        }
      }
      // Declare hash for all unique timestamps
      for(var i=0;i<length;i++) {
        timestamps[created_at_param[i]] = {};
      }
      // Iterate for all timestamps to determine the repective values at that instant in time
      // 1. Get Group Allocation at this timestamp
      var timestamps_arr = [];
      var group_plans_arr = [];
      var tl = 0;
      var gpl = 0;
      for(var time in timestamps) {
        timestamps_arr.push(time);
      }
      for(var group_plan_time in transformed_data.group_plans) {
        group_plans_arr.push(group_plan_time);
      }
      var timestamps_length = timestamps_arr.length;
      var group_plans_length = group_plans_arr.length;
      while (tl < timestamps_length && gpl < group_plans_length) {
          t = timestamps_arr[tl];
          g = group_plans_arr[gpl];
          if(new Date(t).getTime() < new Date(g).getTime()){
            timestamps[t].group_mpa = transformed_data.group_plans[g];
            tl++;
          } else if(t == g){
            timestamps[t].group_mpa = transformed_data.group_plans[g];
            gpl++;
          } else {
            tl++;
            gpl++;
          }
      }
      // 2. Get Sub Group Allocation at each timestamp
      var sub_groups_arr = []
      for(var sub_group_time in transformed_data.sub_groups) {
        sub_groups_arr.push(sub_group_time);
      }
      var sub_groups_length = sub_groups_arr.length;
      var sub_groups_mpa = {};
      var tl = parseInt(timestamps_length - 1);
      var sgl = parseInt(sub_groups_length - 1);
      sub_groups_mpa = transformed_data.sub_groups[sub_groups_arr[sgl]];
      while (tl >= 0 && sgl >= 0) {
        t = timestamps_arr[tl];
        s = sub_groups_arr[sgl];
        timestamps[t].sub_groups_mpa = Object.assign({},sub_groups_mpa);
        if(new Date(t).getTime() > new Date(s).getTime()){
          tl--;
        } else if(new Date(t).getTime() == new Date(s).getTime()){
          for(var individual_sg in transformed_data.sub_groups[s]){
            var actual_created_at = subgroup_actual_created_at[individual_sg];
            if(actual_created_at != undefined && new Date(s).getTime() < new Date(actual_created_at).getTime()){
              delete sub_groups_mpa[individual_sg]
            } else {
            sub_groups_mpa[individual_sg] = parseInt(transformed_data.sub_groups[s][individual_sg]);
            }
          }
          tl--;
          sgl--;
        }
      }
      // 3. Calculate Group Users allocation at each timestamp from result of step 1 & 2
      var sub_group_sum = 0;
      for(var time in timestamps) {
        sub_group_sum = 0;
        for(var sub_group in timestamps[time].sub_groups_mpa){
          sub_group_sum += parseInt(timestamps[time].sub_groups_mpa[sub_group] || 0);
        }
        timestamps[time].group_users_mpa = parseInt(timestamps[time].group_mpa - sub_group_sum);
        if(timestamps[time].group_users_mpa < 0) timestamps[time].group_users_mpa = 0;
      }
      // Result Data Format ->
      // timestamps[t1] = {
      //   indexes: [1,2,3,4]
      //   sub_groups_mpa: {
      //     1: 10,
      //     2: 20
      //   },
      //   group_mpa: 30,
      //   group_user_mpa: 40
      // };
      // Data need to be pushed -> timestamp iterated on sub_groups_mpa.
      function roundMinutes(date) {
        date = new Date(date);
        date.setHours(date.getHours() + Math.round(date.getMinutes()/60));
        date.setMinutes(0, 0, 0); // Resets also seconds and milliseconds
        return date;
      }
      function reduceOneHour(date) {
        date = new Date(date);
        var newDate = date.getTime() - 36e5;
        return newDate;
      }
      var max_timestamp = new Date(created_at_param[length-1]);
      var iter_timestamp = new Date(max_timestamp);
      iter_timestamp.setFullYear(iter_timestamp.getFullYear()-1);
      tl = 0;
      var time_iter = Math.abs(max_timestamp - iter_timestamp) / 36e5;
      var timestamp_trunc = {};
      var timestamp_arr_truc = [];
      for(var time in timestamps) {
        timestamp_trunc[roundMinutes(time)] = (timestamps[time]);
      }
      for(var time in timestamp_trunc) {
        timestamp_arr_truc.push(new Date(roundMinutes(time)));
        tl++;
      }
      timestamp_arr_truc.sort(function(a,b){
        return b > a;
      });
      tl--;
      var curr_time = timestamp_arr_truc[tl];
      var time = timestamp_arr_truc[tl];
      while(time_iter >= 0) {
        time = timestamp_arr_truc[tl];
        if(new Date(group_plans_actual_created_at).getTime() <= new Date(curr_time).getTime())
          return_data.push(JSON.stringify({timestamps: new Date(curr_time), group_ids: group_id_param[0], sub_group_ids: null, mpa_sub_group: null, mpa_group_user: parseInt(timestamp_trunc[time].group_users_mpa), mpa_group: parseInt(timestamp_trunc[time].group_mpa)}));
        if(tl == 0) {
          for(var sub_group in timestamp_trunc[time].sub_groups_mpa){
            if(new Date(subgroup_actual_created_at[sub_group]).getTime() > new Date(curr_time).getTime() || new Date(group_plans_actual_created_at).getTime() > new Date(curr_time).getTime()) continue;
            return_data.push(JSON.stringify({timestamps: new Date(curr_time), group_ids: group_id_param[0], sub_group_ids: sub_group, mpa_sub_group: timestamp_trunc[time].sub_groups_mpa[sub_group], mpa_group_user: parseInt(timestamp_trunc[time].group_users_mpa), mpa_group: parseInt(timestamp_trunc[time].group_mpa)}));
          }
        } else {
          for(var sub_group in timestamp_trunc[time].sub_groups_mpa){
            if(new Date(subgroup_actual_created_at[sub_group]).getTime() > new Date(curr_time).getTime() || new Date(group_plans_actual_created_at).getTime() > new Date(curr_time).getTime()) continue;
            return_data.push(JSON.stringify({timestamps: new Date(curr_time), group_ids: group_id_param[0], sub_group_ids: sub_group, mpa_sub_group: timestamp_trunc[time].sub_groups_mpa[sub_group], mpa_group_user: parseInt(timestamp_trunc[time].group_users_mpa), mpa_group: parseInt(timestamp_trunc[time].group_mpa)}));
          }
          if(new Date(time).getTime() == new Date(curr_time).getTime()) {
            tl--;
          }
        }
        time_iter--;
        curr_time = reduceOneHour(curr_time);
      }
      return return_data;
}

module.exports = { effective_mpa };
