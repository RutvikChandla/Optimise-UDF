const fs = require('fs');
const { generateLargeDataSet } = require('./generateLargeDataSet');
const { effective_mpa: oldEffectiveMpa } = require('./old_function');
const { effective_mpa: newEffectiveMpa } = require('./new_function');

function measureMemoryUsage(label, func, args) {
    global.gc(); // Force garbage collection before measurement (run with --expose-gc)
    const startMemory = process.memoryUsage().heapUsed;
    console.time(label);
    func(...args);
    console.timeEnd(label);
    const endMemory = process.memoryUsage().heapUsed;
    return {
        label,
        memoryUsed: ((endMemory - startMemory) / 1024 / 1024).toFixed(2) // Convert to MB
    };
}

const iterations = 5;
const recordSizes = [10, 100, 1000, 5000, 10000];
const results = [];

for (const numRecords of recordSizes) {
    console.log(`\nRunning benchmark for ${numRecords} records...`);
    
    for (let i = 0; i < iterations; i++) {
        console.log(`Iteration ${i + 1} for ${numRecords} records:`);
        
        // Generate dataset
        console.log('Generating dataset...');
        const inputData = generateLargeDataSet(numRecords);
        fs.writeFileSync(`testData_${numRecords}.json`, JSON.stringify(inputData));
        console.log(`Dataset saved to testData_${numRecords}.json`);
        
        // Load dataset
        const loadedData = JSON.parse(fs.readFileSync(`testData_${numRecords}.json`));
        const args = [
            loadedData.group_id_param,
            loadedData.sub_group_id_param,
            loadedData.created_at_param,
            loadedData.actual_created_at_param,
            loadedData.mpa_param,
            loadedData.table_name_param
        ];
        
        // Measure performance
        const oldMem = measureMemoryUsage(`Old Function - ${numRecords} records (Iteration ${i + 1})`, oldEffectiveMpa, args);
        const newMem = measureMemoryUsage(`New Function - ${numRecords} records (Iteration ${i + 1})`, newEffectiveMpa, args);
        
        // Calculate memory improvement percentage
        const memoryImprovement = (((oldMem.memoryUsed - newMem.memoryUsed) / oldMem.memoryUsed) * 100).toFixed(2);
        results.push({
            iteration: i + 1,
            records: numRecords,
            oldMemory: oldMem.memoryUsed,
            newMemory: newMem.memoryUsed,
            improvement: memoryImprovement
        });
    }
}

// Print results in tabular format
console.log("\nMemory Usage Comparison:");
console.log("| Iteration | Record Size | Old Memory (MB) | New Memory (MB) | Improvement (%) |");
console.log("|-----------|------------|----------------|----------------|-----------------|");
results.forEach(r => {
    console.log(`| ${r.iteration} | ${r.records} | ${r.oldMemory} | ${r.newMemory} | ${r.improvement}% |`);
});
