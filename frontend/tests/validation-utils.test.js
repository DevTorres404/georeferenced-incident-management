import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the dom-utils import that validation-utils uses
vi.mock('../app/js/presentation/dom-utils.js', () => ({
  show: vi.fn((el) => {
    if (el) el.classList.remove('d-none');
  }),
  hide: vi.fn((el) => {
    if (el) el.classList.add('d-none');
  }),
}));

import {
  clearValidationErrors,
  setupValidationListeners,
  clearFieldError,
  setFieldError,
  setFormAlert,
  handleBackendErrors,
  validateFormFrontend,
} from '../app/js/shared/validators/validation-utils.js';

describe('clearValidationErrors', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('does nothing for null form', () => {
    expect(() => clearValidationErrors(null)).not.toThrow();
  });

  it('removes was-validated class', () => {
    const form = document.createElement('form');
    form.classList.add('was-validated');
    clearValidationErrors(form);
    expect(form.classList.contains('was-validated')).toBe(false);
  });

  it('removes is-invalid from inputs', () => {
    const form = document.createElement('form');
    const input = document.createElement('input');
    input.classList.add('is-invalid');
    form.appendChild(input);
    clearValidationErrors(form);
    expect(input.classList.contains('is-invalid')).toBe(false);
  });

  it('removes backend-error feedbacks', () => {
    const form = document.createElement('form');
    const feedback = document.createElement('div');
    feedback.className = 'invalid-feedback backend-error';
    feedback.textContent = 'Error!';
    form.appendChild(feedback);
    clearValidationErrors(form);
    expect(form.querySelector('.invalid-feedback.backend-error')).toBeNull();
  });
});

describe('setFieldError', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('does nothing for null input', () => {
    expect(() => setFieldError(null, 'error')).not.toThrow();
  });

  it('sets is-invalid on the input', () => {
    const input = document.createElement('input');
    setFieldError(input, 'error msg');
    expect(input.classList.contains('is-invalid')).toBe(true);
  });

  it('creates feedback element and sets message', () => {
    const div = document.createElement('div');
    const input = document.createElement('input');
    div.appendChild(input);
    setFieldError(input, 'custom error');
    const feedback = div.querySelector('.invalid-feedback.backend-error');
    expect(feedback).not.toBeNull();
    expect(feedback.textContent).toBe('custom error');
  });
});

describe('clearFieldError', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('does nothing for null input', () => {
    expect(() => clearFieldError(null)).not.toThrow();
  });

  it('removes is-invalid', () => {
    const input = document.createElement('input');
    input.classList.add('is-invalid');
    clearFieldError(input);
    expect(input.classList.contains('is-invalid')).toBe(false);
  });

  it('removes feedback element', () => {
    const div = document.createElement('div');
    const input = document.createElement('input');
    input.classList.add('is-invalid');
    div.appendChild(input);
    const fb = document.createElement('div');
    fb.className = 'invalid-feedback backend-error';
    div.appendChild(fb);
    clearFieldError(input);
    expect(div.querySelector('.invalid-feedback.backend-error')).toBeNull();
  });

  it('works with string id', () => {
    document.body.innerHTML = '<input id="my-input" class="is-invalid" />';
    clearFieldError('my-input');
    const input = document.getElementById('my-input');
    expect(input.classList.contains('is-invalid')).toBe(false);
  });
});

describe('setFormAlert', () => {
  it('sets alert class and message', () => {
    const div = document.createElement('div');
    setFormAlert(div, 'Something went wrong', 'danger');
    expect(div.className).toBe('alert alert-danger');
    expect(div.textContent).toBe('Something went wrong');
  });

  it('uses default type danger', () => {
    const div = document.createElement('div');
    setFormAlert(div, 'Oops');
    expect(div.className).toBe('alert alert-danger');
  });

  it('shows element by removing d-none', () => {
    const div = document.createElement('div');
    div.classList.add('d-none');
    setFormAlert(div, 'Alert!');
    expect(div.classList.contains('d-none')).toBe(false);
  });
});

describe('handleBackendErrors', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('displays 422 field errors on matching inputs', () => {
    const form = document.createElement('form');
    const input = document.createElement('input');
    input.setAttribute('name', 'email');
    form.appendChild(input);
    document.body.appendChild(form);

    const error = {
      status: 422,
      errors: { email: ['El email es requerido'] },
    };

    handleBackendErrors(error, form, null);
    expect(input.classList.contains('is-invalid')).toBe(true);
    const feedback = form.querySelector('.invalid-feedback.backend-error');
    expect(feedback.textContent).toBe('El email es requerido');
  });

  it('falls back to alert container when field not found', () => {
    const form = document.createElement('form');
    const alertDiv = document.createElement('div');
    form.appendChild(alertDiv);
    document.body.appendChild(form);

    const error = {
      status: 422,
      errors: { email: ['El email es requerido'] },
    };

    handleBackendErrors(error, form, alertDiv);
    // The code sets field-specific message in else branch, then overwrites
    // with the generic fallback because no field received focus
    expect(alertDiv.textContent).toBe('Existen errores de validación, por favor revisa el formulario.');
  });

  it('shows generic message for non-422 errors', () => {
    const alertDiv = document.createElement('div');
    document.body.appendChild(alertDiv);

    const error = new Error('Network failure');
    handleBackendErrors(error, null, alertDiv);
    expect(alertDiv.textContent).toBe('Network failure');
  });
});

describe('validateFormFrontend', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns true for null form', () => {
    expect(validateFormFrontend(null)).toBe(true);
  });

  it('validates required fields', () => {
    const form = document.createElement('form');
    const input = document.createElement('input');
    input.setAttribute('required', '');
    input.setAttribute('name', 'name');
    form.appendChild(input);
    document.body.appendChild(form);

    const isValid = validateFormFrontend(form);
    expect(isValid).toBe(false);
    expect(input.classList.contains('is-invalid')).toBe(true);
  });
});
