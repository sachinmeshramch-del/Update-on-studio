function calcRMA(values, period) {
    if (values.length < period) return [];
    let rma = [];
    let sum = 0;
    for (let i = 0; i < period; i++) sum += values[i];
    rma[period - 1] = sum / period;
    for (let i = period; i < values.length; i++) {
        rma[i] = (rma[i - 1] * (period - 1) + values[i]) / period;
    }
    return rma;
}
console.log(calcRMA([1,2,3,4,5], 3));
