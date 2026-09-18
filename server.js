/**
 * POST /api/register
 * Solo genera el PIN y lo envía por correo. NO crea el usuario en la DB todavía.
 */
app.post('/api/register', async (req, res) => {
  try {
    const rawEmail = req.body.email || req.body.correo;
    const { nombre, apellido, password } = req.body;

    if (!rawEmail) {
      return res.status(400).json({
        success: false,
        error: 'El correo electrónico es obligatorio.'
      });
    }

    const email = String(rawEmail).trim().toLowerCase();
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'El formato de correo no es válido.'
      });
    }

    // 1. Verificar si el usuario YA existe en la base de datos
    const checkUser = await pool.query('SELECT id FROM usuarios WHERE correo = $1', [email]);
    if (checkUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Este correo electrónico ya se encuentra registrado.'
      });
    }

    // 2. Preparar los datos temporales del usuario
    const nom = (nombre || email.split('@')[0]).trim();
    const ape = (apellido || 'Cliente').trim();
    const pwd = password ? String(password) : 'auth_2fa_pass';
    const hash = await bcrypt.hash(pwd, 10);

    // 3. Generar PIN de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // 4. Guardar PIN y datos temporales en la tabla verification_codes
    await pool.query(
      'DELETE FROM verification_codes WHERE email = $1 OR expires_at < NOW()',
      [email]
    );

    await pool.query(
      `INSERT INTO verification_codes (email, code, expires_at) 
       VALUES ($1, $2, NOW() + INTERVAL '10 minutes')`,
      [email, code]
    );

    // Guardamos los datos temporales para crearlo tras verificar (puedes guardarlo en memoria o sesión)
    // O procesarlo en la verificación.
    
    // 5. Enviar el código por correo
    await sendVerificationEmail(email, code, {
      isRegister: true,
      nombre: nom
    });

    console.log(`[2FA Register] 📩 Código enviado a: ${email}`);

    return res.status(200).json({
      requires2FA: true,
      tempUserData: { email, nombre: nom, apellido: ape, hash }, // Datos temporales para la verificación
      message: 'Código de verificación enviado a tu correo.'
    });

  } catch (error) {
    console.error('[Error en POST /api/register]:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al procesar el registro.',
      details: error.message
    });
  }
});

/**
 * POST /api/verify-2fa
 * Verifica el PIN. Si es registro, recién aquí crea la cuenta en la DB.
 */
app.post('/api/verify-2fa', async (req, res) => {
  try {
    const { email, code, isRegister, userData } = req.body;

    if (!email || !code) {
      return res.status(400).json({
        success: false,
        error: 'Email y código son requeridos.'
      });
    }

    const cleanEmail = String(email).trim().toLowerCase();

    // 1. Validar el código en verification_codes
    const result = await pool.query(
      'SELECT * FROM verification_codes WHERE email = $1 AND code = $2 AND expires_at > NOW()',
      [cleanEmail, code]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Código inválido o expirado.'
      });
    }

    // 2. Si el código es correcto, consumirlo/borrarlo
    await pool.query('DELETE FROM verification_codes WHERE email = $1', [cleanEmail]);

    // 3. Si viene del flujo de registro, crear al usuario en la DB AHORA
    let user;
    if (isRegister && userData) {
      const { nombre, apellido, hash } = userData;
      const newUser = await pool.query(
        'INSERT INTO usuarios (nombre, apellido, correo, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, nombre, apellido, correo',
        [nombre, apellido, cleanEmail, hash]
      );
      user = newUser.rows[0];
    } else {
      const existingUser = await pool.query('SELECT id, nombre, apellido, correo FROM usuarios WHERE correo = $1', [cleanEmail]);
      user = existingUser.rows[0];
    }

    console.log(`[2FA Verify] ✅ PIN verificado exitosamente para: ${cleanEmail}`);

    return res.status(200).json({
      success: true,
      message: 'Verificación exitosa.',
      user
    });

  } catch (error) {
    console.error('[Error en /api/verify-2fa]:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al verificar el código.'
    });
  }
});