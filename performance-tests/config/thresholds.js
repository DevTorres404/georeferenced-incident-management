export const readThresholds = {
  http_req_failed: [{ threshold: 'rate<0.01', abortOnFail: true }],
  http_req_duration: [
    { threshold: 'p(95)<2000', abortOnFail: false },
    { threshold: 'avg<800', abortOnFail: false },
  ],
  checks: [{ threshold: 'rate>0.99', abortOnFail: true }],
};

export const loginThresholds = {
  http_req_failed: [{ threshold: 'rate<0.01', abortOnFail: true }],
  http_req_duration: [
    { threshold: 'p(95)<3000', abortOnFail: false },
    { threshold: 'avg<1500', abortOnFail: false },
  ],
  checks: [{ threshold: 'rate>0.99', abortOnFail: true }],
};

export const writeThresholds = {
  http_req_failed: [{ threshold: 'rate<0.02', abortOnFail: true }],
  http_req_duration: [
    { threshold: 'p(95)<5000', abortOnFail: false },
    { threshold: 'avg<2000', abortOnFail: false },
  ],
  checks: [{ threshold: 'rate>0.98', abortOnFail: true }],
};

export const uploadThresholds = {
  http_req_failed: [{ threshold: 'rate<0.02', abortOnFail: true }],
  http_req_duration: [
    { threshold: 'p(95)<10000', abortOnFail: false },
    { threshold: 'avg<4000', abortOnFail: false },
  ],
  checks: [{ threshold: 'rate>0.95', abortOnFail: true }],
};

export const stressThresholds = {
  http_req_failed: [{ threshold: 'rate<0.05', abortOnFail: false }],
  http_req_duration: [
    { threshold: 'p(95)<5000', abortOnFail: false },
    { threshold: 'avg<2000', abortOnFail: false },
  ],
  checks: [{ threshold: 'rate>0.95', abortOnFail: false }],
};
