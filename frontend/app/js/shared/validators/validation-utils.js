/**
 * Utilidades para manejo de validaciones y errores de backend en el DOM (Estilo Bootstrap)
 */

import { show, hide } from '../../presentation/dom-utils.js?v=15'

/**
 * Limpia todos los errores visuales de un formulario.
 * - Quita `.is-invalid`
 * - Borra mensajes `.invalid-feedback`
 * - Remueve `.was-validated`
 * @param {HTMLFormElement} formElement
 */
export function clearValidationErrors(formElement) {
  if (!formElement) {
    return
  }

  formElement.classList.remove('was-validated')

  const invalidInputs = formElement.querySelectorAll('.is-invalid')
  invalidInputs.forEach(input => {
    input.classList.remove('is-invalid')
  })

  const feedbacks = formElement.querySelectorAll('.invalid-feedback.backend-error')
  feedbacks.forEach(feedback => feedback.remove())
}

/**
 * Inicializa los eventos en un formulario para que al teclear/cambiar un campo,
 * se limpie su estado de error de forma individual.
 * @param {HTMLFormElement} formElement
 */
export function setupValidationListeners(formElement) {
  if (!formElement) {
    return
  }

  formElement.addEventListener('input', event => {
    if (event.target.classList.contains('is-invalid')) {
      clearFieldError(event.target)
    }
  })

  formElement.addEventListener('change', event => {
    if (event.target.classList.contains('is-invalid')) {
      clearFieldError(event.target)
    }
  })
}

/**
 * Limpia el error de un campo específico.
 * @param {HTMLElement} inputElement
 */
export function clearFieldError(inputElementOrId) {
  const inputElement = typeof inputElementOrId === 'string' ?
    document.getElementById(inputElementOrId) :
    inputElementOrId

  if (!inputElement) {
    return
  }

  inputElement.classList.remove('is-invalid')

  let container = inputElement.parentElement
  if (container && container.classList.contains('input-group')) {
    container = container.parentElement
  }

  if (container) {
    const feedback = container.querySelector('.invalid-feedback.backend-error')
    if (feedback) {
      feedback.remove()
    }
  }
}

/**
 * Muestra un mensaje de error específico debajo de un campo usando .invalid-feedback
 * @param {HTMLElement} inputElement
 * @param {string} message
 */
export function setFieldError(inputElementOrId, message) {
  const inputElement = typeof inputElementOrId === 'string' ?
    document.getElementById(inputElementOrId) :
    inputElementOrId

  if (!inputElement) {
    return
  }

  inputElement.classList.add('is-invalid')

  let container = inputElement.parentElement
  if (container && container.classList.contains('input-group')) {
    container = container.parentElement
  }

  if (container) {
    let feedback = container.querySelector('.invalid-feedback.backend-error')

    if (!feedback) {
      feedback = document.createElement('div')
      feedback.className = 'invalid-feedback backend-error'
      container.appendChild(feedback)
    }

    feedback.textContent = message
    feedback.style.display = 'block'
  }
}

/**
 * Muestra una alerta general en un contenedor específico,
 * o hace fallback a alert() si no existe contenedor.
 * @param {HTMLElement} containerElement
 * @param {string} message
 * @param {string} type 'danger', 'warning', 'success'
 */
export function setFormAlert(containerElement, message, type = 'danger') {
  if (containerElement) {
    containerElement.className = `alert alert-${type}`
    containerElement.textContent = message
    show(containerElement)
  } else {
    console.warn(`[Validation Error]: ${message}`)
  }
}

/**
 * Función central para procesar errores (generalmente de `request` o `backend-client`)
 * y plasmarlos en un formulario y su contenedor de alerta.
 * @param {Error} error El error capturado (ej. ApiError)
 * @param {HTMLFormElement} formElement El formulario asociado
 * @param {HTMLElement} alertContainer El elemento div para la alerta global (opcional)
 */
export function handleBackendErrors(error, formElement, alertContainer = null) {
  if (formElement) {
    clearValidationErrors(formElement)
  }

  if (alertContainer) {
    hide(alertContainer)
  }

  // Si no es un ApiError o no tiene status, asumimos que es un error crudo
  const status = error.status || 500

  if ((status === 422 || status === 409) && error.errors && typeof error.errors === 'object') {
    let focusSet = false

    for (const [field, messages] of Object.entries(error.errors)) {
      if (formElement && messages.length > 0) {
        let input = formElement.querySelector(`[name="${field}"]`) || formElement.querySelector(`#${field}`)

        // Fix for specific field names like "register-email" mapped from "email"
        if (!input && formElement.id.includes('register')) {
          input = formElement.querySelector(`#register-${field}`)
        }

        if (input) {
          setFieldError(input, messages[0])
          if (!focusSet) {
            input.focus()
            focusSet = true
          }
        } else if (alertContainer) {
          setFormAlert(alertContainer, messages[0], 'danger')
        }
      }
    }

    if (!focusSet && alertContainer) {
      setFormAlert(alertContainer, 'Existen errores de validación, por favor revisa el formulario.', 'danger')
    }

    return
  }

  if (alertContainer) {
    setFormAlert(alertContainer, error.message || 'Ocurrió un error inesperado.', 'danger')
  }
}

/**
 * Valida un formulario del lado del cliente usando HTML5 Validity API,
 * pero aplicando nuestros estilos de Bootstrap.
 * @param {HTMLFormElement} formElement
 * @returns {boolean} true si es válido, false si tiene errores
 */
export function validateFormFrontend(formElement) {
  if (!formElement) {
    return true
  }

  clearValidationErrors(formElement)
  let isValid = true
  let firstInvalid = null;
  [...formElement.elements].forEach(input => {
    if (input.willValidate && !input.checkValidity()) {
      isValid = false

      // Personalización básica de mensajes de HTML5
      let msg = input.validationMessage
      if (input.validity.valueMissing) {
        msg = 'Este campo es obligatorio.'
      } else if (input.validity.typeMismatch && input.type === 'email') {
        msg = 'Ingrese un correo electrónico válido.'
      } else if (input.validity.tooShort) {
        msg = `El valor debe tener al menos ${input.getAttribute('minlength')} caracteres.`
      }

      setFieldError(input, msg)

      if (!firstInvalid) {
        firstInvalid = input
      }
    }
  })

  if (firstInvalid) {
    firstInvalid.focus()
  }

  return isValid
}
