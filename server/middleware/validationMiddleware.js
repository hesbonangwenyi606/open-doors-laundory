/**
 * Request validation middleware
 * Validates and sanitizes incoming request data
 */

// Validate booking request data
export function validateBookingRequest(req, res, next) {
  try {
    const { 
      name = '', 
      phone = '', 
      service = '', 
      location = '', 
      paymentMethod = '', 
      mpesaPhone = '', 
      notes = '', 
      items = [] 
    } = req.body || {};

    // Required fields
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required.' });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ error: 'Phone number is required.' });
    }
    if (!service || !service.trim()) {
      return res.status(400).json({ error: 'At least one service is required.' });
    }

    // Validate name (max 80 chars)
    if (name.trim().length > 80) {
      return res.status(400).json({ error: 'Name must be 80 characters or less.' });
    }

    // Validate phone
    if (phone.trim().length > 30) {
      return res.status(400).json({ error: 'Phone number must be 30 characters or less.' });
    }

    // Validate items array
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one service item is required.' });
    }
    if (items.length > 20) {
      return res.status(400).json({ error: 'Maximum 20 services per request.' });
    }

    // Validate payment method
    if (!['Cash', 'M-Pesa'].includes(paymentMethod)) {
      return res.status(400).json({ error: 'Select Cash or M-Pesa as the payment method.' });
    }

    // Validate M-Pesa phone if payment method is M-Pesa
    if (paymentMethod === 'M-Pesa') {
      const cleanMpesaPhone = String(mpesaPhone || phone).replace(/[\s-]/g, '');
      if (!/^(?:\+?254|0)(?:7|1)\d{8}$/.test(cleanMpesaPhone)) {
        return res.status(400).json({ error: 'Enter a valid Kenyan M-Pesa phone number.' });
      }
    }

    // Validate location
    if (location && location.trim().length > 120) {
      return res.status(400).json({ error: 'Location must be 120 characters or less.' });
    }

    // Validate notes
    if (notes && notes.trim().length > 500) {
      return res.status(400).json({ error: 'Notes must be 500 characters or less.' });
    }

    // Validate service
    if (service.trim().length > 240) {
      return res.status(400).json({ error: 'Service description must be 240 characters or less.' });
    }

    // Attach validated data to request
    req.validatedBookingData = {
      name: name.trim().slice(0, 80),
      phone: phone.trim().slice(0, 30),
      service: service.trim().slice(0, 240),
      location: location ? location.trim().slice(0, 120) : '',
      paymentMethod,
      mpesaPhone: paymentMethod === 'M-Pesa' ? String(mpesaPhone || phone).replace(/[\s-]/g, '') : null,
      notes: notes ? notes.trim().slice(0, 500) : '',
      items,
    };

    next();
  } catch (error) {
    return res.status(400).json({ error: 'Invalid request data.' });
  }
}

// Validate admin login data
export function validateAdminLogin(req, res, next) {
  try {
    const { email = '', password = '' } = req.body || {};

    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email is required.' });
    }
    if (!password || !password.trim()) {
      return res.status(400).json({ error: 'Password is required.' });
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format.' });
    }

    // Limit email and password length
    if (email.length > 254) {
      return res.status(400).json({ error: 'Email is too long.' });
    }
    if (password.length > 128) {
      return res.status(400).json({ error: 'Password is too long.' });
    }

    next();
  } catch (error) {
    return res.status(400).json({ error: 'Invalid login data.' });
  }
}

// Validate process steps update
export function validateProcessSteps(req, res, next) {
  try {
    const { steps } = req.body || {};

    if (!Array.isArray(steps)) {
      return res.status(400).json({ error: 'Steps must be an array.' });
    }
    if (steps.length < 2) {
      return res.status(400).json({ error: 'Provide at least 2 process steps.' });
    }
    if (steps.length > 12) {
      return res.status(400).json({ error: 'Maximum 12 process steps.' });
    }

    // Validate each step
    const cleanedSteps = [];
    for (const step of steps) {
      const str = String(step).trim();
      if (!str) {
        return res.status(400).json({ error: 'Every step is required.' });
      }
      if (str.length > 80) {
        return res.status(400).json({ error: 'Every step must be under 80 characters.' });
      }
      cleanedSteps.push(str);
    }

    req.validatedSteps = cleanedSteps;
    next();
  } catch (error) {
    return res.status(400).json({ error: 'Invalid process steps.' });
  }
}

// Validate pricing update
export function validatePricingUpdate(req, res, next) {
  try {
    const { seo, priceGroups } = req.body || {};

    // If updating SEO
    if (seo) {
      if (!seo.title || !seo.title.trim() || seo.title.length > 70) {
        return res.status(400).json({ error: 'SEO title is required and must be 70 characters or less.' });
      }
      if (!seo.description || !seo.description.trim() || seo.description.length > 170) {
        return res.status(400).json({ error: 'SEO description is required and must be 170 characters or less.' });
      }
    }

    // If updating price groups
    if (priceGroups) {
      if (!Array.isArray(priceGroups) || priceGroups.length !== 3) {
        return res.status(400).json({ error: 'Exactly 3 pricing groups are required.' });
      }

      for (const group of priceGroups) {
        if (!group.t || !group.t.trim() || group.t.length > 50) {
          return res.status(400).json({ error: 'Group title is required and must be 50 characters or less.' });
        }
        if (!Array.isArray(group.items)) {
          return res.status(400).json({ error: 'Group items must be an array.' });
        }
        if (group.items.length === 0) {
          return res.status(400).json({ error: 'Each group must have at least one item.' });
        }

        for (const item of group.items) {
          if (!Array.isArray(item) || item.length !== 2) {
            return res.status(400).json({ error: 'Each item must be an array of [name, price].' });
          }
          const [name, price] = item;
          if (!name || !name.trim() || name.length > 80) {
            return res.status(400).json({ error: 'Item name is required and must be 80 characters or less.' });
          }
          if (!price || price.length > 20) {
            return res.status(400).json({ error: 'Item price is required and must be 20 characters or less.' });
          }
        }
      }
    }

    next();
  } catch (error) {
    return res.status(400).json({ error: 'Invalid pricing data.' });
  }
}

// Validate status update
export function validateStatusUpdate(req, res, next) {
  try {
    const { status } = req.body || {};
    const allowedStatuses = ['new', 'confirmed', 'completed', 'cancelled'];

    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be one of: new, confirmed, completed, cancelled.' });
    }

    req.validatedStatus = status;
    next();
  } catch (error) {
    return res.status(400).json({ error: 'Invalid status.' });
  }
}
