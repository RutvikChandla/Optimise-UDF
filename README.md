# Optimise-UDF

This repository contains a benchmarking and comparison of old vs new function implementations to measure memory usage efficiency.

## Files
- `benchmark.js` - Runs the benchmark test on both functions and logs memory usage.
- `compare_functions.js` - Helper script for running comparisons.
- `new_function.js` - Optimized function implementation.
- `old_function.js` - Legacy function implementation.

## Benchmark Results
The benchmark script runs both functions for different input sizes and measures memory usage across multiple iterations. Below is a sample output:

### Memory Usage Comparison
| Iteration | Record Size | Old Memory (MB) | New Memory (MB) | Improvement (%) |
|-----------|------------|----------------|----------------|-----------------|
| 1 | 10 | 0.66 | 0.43 | 34.85% |
| 2 | 10 | 0.56 | 0.60 | -7.14% |
| 3 | 10 | 0.61 | 0.29 | 52.46% |
| 4 | 10 | 1.12 | 0.57 | 49.11% |
| 5 | 10 | 2.26 | 0.29 | 87.17% |
| 1 | 100 | 1.37 | 3.05 | -122.63% |
| 2 | 100 | 1.52 | 2.49 | -63.82% |
| 3 | 100 | 8.47 | 2.87 | 66.12% |
| 4 | 100 | 5.38 | 2.95 | 45.17% |
| 5 | 100 | 9.41 | 2.70 | 71.31% |
| 1 | 1000 | 24.70 | 20.56 | 16.76% |
| 2 | 1000 | 27.47 | 11.56 | 57.92% |
| 3 | 1000 | 26.76 | 12.01 | 55.12% |
| 4 | 1000 | 21.22 | 18.84 | 11.22% |
| 5 | 1000 | 24.81 | 20.36 | 17.94% |
| 1 | 5000 | 76.84 | 53.86 | 29.91% |
| 2 | 5000 | 72.96 | 57.43 | 21.29% |
| 3 | 5000 | 77.12 | 55.22 | 28.40% |
| 4 | 5000 | 81.47 | 54.90 | 32.61% |
| 5 | 5000 | 67.27 | 55.25 | 17.87% |
| 1 | 10000 | 144.70 | 104.23 | 27.97% |
| 2 | 10000 | 134.54 | 104.37 | 22.42% |
| 3 | 10000 | 140.01 | 108.79 | 22.30% |
| 4 | 10000 | 129.26 | 113.20 | 12.42% |
| 5 | 10000 | 134.11 | 105.75 | 21.15% |

## How to Run the Benchmark
1. Clone this repository:
   ```sh
   git clone https://github.com/your-repo/Optimise-UDF.git
   cd Optimise-UDF
   ```
2. Install Node.js dependencies (if any required).
3. Run the benchmark script:
   ```sh
   node --expose-gc benchmark.js
   ```
4. The output will display memory usage statistics in tabular format.

## Observations
- The optimized function significantly reduces memory usage in most cases.
- Some cases show increased memory usage due to different memory allocation strategies.
- On larger datasets, the new function consistently outperforms the old one.

