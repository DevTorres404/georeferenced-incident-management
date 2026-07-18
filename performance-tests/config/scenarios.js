export const smoke = {
  executor: 'constant-vus',
  vus: 1,
  duration: '30s',
};

export const load = {
  executor: 'ramping-vus',
  startVUs: 0,
  stages: [
    { duration: '30s', target: 10 },
    { duration: '2m', target: 10 },
    { duration: '30s', target: 0 },
  ],
};

export const concurrentRead = {
  executor: 'constant-vus',
  vus: 25,
  duration: '2m',
};

export const stress = {
  executor: 'ramping-vus',
  startVUs: 1,
  stages: [
    { duration: '30s', target: 10 },
    { duration: '2m', target: 10 },
    { duration: '2m', target: 25 },
    { duration: '2m', target: 50 },
    { duration: '2m', target: 100 },
    { duration: '30s', target: 0 },
  ],
};

export const gentleCreate = {
  executor: 'constant-vus',
  vus: 5,
  duration: '1m',
};

export const gentleUpload = {
  executor: 'constant-vus',
  vus: 3,
  duration: '1m',
};
