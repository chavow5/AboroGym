import React, { useState, useEffect, useMemo } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut
} from 'firebase/auth';
import {
  collection,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot
} from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Users,
  CalendarClock,
  DollarSign,
  BarChart3,
  Plus,
  Trash2,
  Edit3,
  FileText,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Search,
  Zap,
  Settings,
  ChevronDown,
  ChevronRight,
  X,
  UserPlus,
  Banknote,
  Landmark,
  Share2,
  Copy
} from 'lucide-react';
import { auth, googleProvider, db } from './firebase';
import {
  FRANJAS_HORARIAS,
  DIAS_SEMANA,
  PLANES_ENTRENAMIENTO,
  MESES_COBRANZA,
  PRIMARY_ADMIN_EMAIL,
  PRIMARY_GYM_UID,
  DEFAULT_GYM_CONFIG
} from './seedData';

const formatCurrency = (val) => {
  const num = Number(val) || 0;
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0
  }).format(num);
};

export default function App() {
  // ==================== AUTH STATE ====================
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [newAllowedEmail, setNewAllowedEmail] = useState('');

  // ==================== GYM DATA STATE ====================
  const [gymConfig, setGymConfig] = useState(DEFAULT_GYM_CONFIG);
  const [alumnos, setAlumnos] = useState([]);
  const [cobranzas, setCobranzas] = useState([]);

  // ==================== NAVIGATION & UI STATE ====================
  // 'Dashboard' | 'Alumnos' | 'Turnos' | 'Cobranzas'
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [activeMonth, setActiveMonth] = useState('Octubre');
  const [statusBanner, setStatusBanner] = useState('');
  const [busyId, setBusyId] = useState(null);

  // Collapsible sections state
  const [openSections, setOpenSections] = useState({
    dashFastCharge: true,
    dashTurnos: false,
    dashPlanes: false,
    dashConfig: false,
    cobFastCharge: true,
    cobManualForm: false,
    cobHistory: true
  });

  const toggleSection = (key) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Expanded individual items on mobile (student IDs and time slots)
  const [expandedAlumnoId, setExpandedAlumnoId] = useState(null);
  const [expandedHora, setExpandedHora] = useState('19:00');
  const [selectedDia, setSelectedDia] = useState('lunes');

  // ==================== MODALS STATE ====================
  const [showAlumnoModal, setShowAlumnoModal] = useState(false);
  const [editingAlumnoId, setEditingAlumnoId] = useState(null);
  const [alumnoForm, setAlumnoForm] = useState({
    nombreCompleto: '',
    telefono: '',
    edad: '',
    diasPorSemana: 3,
    planEntrenamiento: 'Funcional',
    lunes: '',
    martes: '',
    miercoles: '',
    jueves: '',
    viernes: '',
    correo: '',
    fechaInscripcion: new Date().toISOString().slice(0, 10),
    activo: true
  });

  // PDF Export Modal State
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfOptions, setPdfOptions] = useState({
    mes: 'Octubre',
    metodoFiltro: 'TODOS',
    incluirResumenFinanciero: true,
    incluirPagosDelMes: true,
    incluirPendientesDePago: true,
    incluirPadronAlumnos: false,
    incluirOcupacionTurnos: false
  });

  // Self-Registration (WhatsApp Link) State
  const [showShareModal, setShowShareModal] = useState(false);
  const [inscripcionGymUid, setInscripcionGymUid] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('inscripcion') || '';
  });
  const [inscripcionGymName, setInscripcionGymName] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('gym') || 'AboroGym';
  });
  const [publicForm, setPublicForm] = useState({
    nombreCompleto: '',
    telefono: '',
    edad: '',
    diasPorSemana: 3,
    planEntrenamiento: 'Funcional',
    lunes: '',
    martes: '',
    miercoles: '',
    jueves: '',
    viernes: '',
    correo: ''
  });
  const [publicBusy, setPublicBusy] = useState(false);
  const [publicDone, setPublicDone] = useState(false);
  const [publicError, setPublicError] = useState('');

  // Search & filters
  const [searchAlumno, setSearchAlumno] = useState('');
  const [filterDias, setFilterDias] = useState('TODOS');
  const [searchPendiente, setSearchPendiente] = useState('');

  // Manual Cobranza & Config forms
  const [cobranzaForm, setCobranzaForm] = useState({
    alumnoId: '',
    dias: 3,
    precioCuota: DEFAULT_GYM_CONFIG.tarifa3Dias,
    actividad: 'Funcional',
    metodoPago: 'Transferencia',
    descuentoInscripcion: 0,
    observaciones: '',
    fechaPago: new Date().toISOString().slice(0, 10)
  });

  const [tarifasForm, setTarifasForm] = useState(DEFAULT_GYM_CONFIG);

  // Clean up any legacy localStorage keys
  useEffect(() => {
    try {
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith('aborogym_')) {
          localStorage.removeItem(k);
        }
      });
    } catch {
      // Ignore
    }
  }, []);

  // ==================== AUTH LISTENER ====================
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    setTarifasForm(gymConfig);
  }, [gymConfig]);

  // ==================== FIRESTORE LISTENERS (SINGLE GYM WORKSPACE) ====================
  const gymUid = PRIMARY_GYM_UID;
  const isPrimaryOwner =
    Boolean(user) &&
    (user.uid === PRIMARY_GYM_UID ||
      (user.email || '').toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase());

  useEffect(() => {
    if (!user) {
      setAlumnos([]);
      setCobranzas([]);
      setGymConfig(DEFAULT_GYM_CONFIG);
      setConfigLoaded(false);
      setAccessDenied(false);
      return;
    }

    setConfigLoaded(false);
    setAccessDenied(false);

    const unsubConfig = onSnapshot(
      doc(db, 'users', gymUid, 'config', 'general'),
      async (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const allowed = Array.isArray(data.emailsAutorizados)
            ? data.emailsAutorizados.map((e) => String(e).toLowerCase().trim())
            : [PRIMARY_ADMIN_EMAIL];
          if (!allowed.includes(PRIMARY_ADMIN_EMAIL)) {
            allowed.unshift(PRIMARY_ADMIN_EMAIL);
          }
          const merged = {
            ...DEFAULT_GYM_CONFIG,
            ...data,
            emailsAutorizados: allowed
          };
          setGymConfig(merged);
          const userEmail = (user.email || '').toLowerCase().trim();
          const authorized =
            user.uid === PRIMARY_GYM_UID ||
            userEmail === PRIMARY_ADMIN_EMAIL ||
            allowed.includes(userEmail);
          setAccessDenied(!authorized);
          setConfigLoaded(true);
        } else {
          setGymConfig(DEFAULT_GYM_CONFIG);
          const userEmail = (user.email || '').toLowerCase().trim();
          const ownerAccess =
            user.uid === PRIMARY_GYM_UID || userEmail === PRIMARY_ADMIN_EMAIL;
          setAccessDenied(!ownerAccess);
          setConfigLoaded(true);
          if (ownerAccess) {
            try {
              await setDoc(doc(db, 'users', gymUid, 'config', 'general'), {
                ownerUid: gymUid,
                ...DEFAULT_GYM_CONFIG,
                emailsAutorizados: [PRIMARY_ADMIN_EMAIL],
                updatedAt: new Date().toISOString()
              });
            } catch (e) {
              console.warn('Init config warning:', e.message);
            }
          }
        }
      },
      (err) => {
        console.warn('Aviso config:', err.message);
        const userEmail = (user.email || '').toLowerCase().trim();
        const ownerAccess =
          user.uid === PRIMARY_GYM_UID || userEmail === PRIMARY_ADMIN_EMAIL;
        setAccessDenied(!ownerAccess);
        setConfigLoaded(true);
      }
    );

    const unsubAlumnos = onSnapshot(
      collection(db, 'users', gymUid, 'alumnos'),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (a.nombreCompleto || '').localeCompare(b.nombreCompleto || ''));
        setAlumnos(list);
      },
      (err) => console.warn('Aviso alumnos:', err.message)
    );

    const unsubCobranzas = onSnapshot(
      collection(db, 'users', gymUid, 'cobranzas'),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.fechaPago || '').localeCompare(a.fechaPago || ''));
        setCobranzas(list);
      },
      (err) => console.warn('Aviso cobranzas:', err.message)
    );

    return () => {
      unsubConfig();
      unsubAlumnos();
      unsubCobranzas();
    };
  }, [user, gymUid]);

  const showToast = (msg) => {
    setStatusBanner(msg);
    setTimeout(() => setStatusBanner(''), 3200);
  };

  const getPrecioByDias = (diasNum, cfg = gymConfig) => {
    if (Number(diasNum) === 2) return Number(cfg.tarifa2Dias) || 28000;
    if (Number(diasNum) === 5) return Number(cfg.tarifa5Dias) || 45000;
    return Number(cfg.tarifa3Dias) || 35000;
  };

  // ==================== AUTH HANDLERS ====================
  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      let msg = 'Correo o contraseña incorrectos.';
      if (err.code === 'auth/too-many-requests') {
        msg = 'Demasiados intentos. Intenta más tarde o entra con Google.';
      }
      setAuthError(msg);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleGoogleLogin = async () => {
    setAuthError('');
    setAuthBusy(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(
        err.code === 'auth/popup-closed-by-user'
          ? 'Inicio cancelado.'
          : 'Error al iniciar con Google.'
      );
    } finally {
      setAuthBusy(false);
    }
  };

  // ==================== ALUMNOS CRUD ====================
  const openNewAlumnoModal = () => {
    setEditingAlumnoId(null);
    setAlumnoForm({
      nombreCompleto: '',
      telefono: '',
      edad: '',
      diasPorSemana: 3,
      planEntrenamiento: 'Funcional',
      lunes: '',
      martes: '',
      miercoles: '',
      jueves: '',
      viernes: '',
      correo: '',
      fechaInscripcion: new Date().toISOString().slice(0, 10),
      activo: true
    });
    setShowAlumnoModal(true);
  };

  const openEditAlumnoModal = (alu) => {
    setEditingAlumnoId(alu.id);
    setAlumnoForm({
      nombreCompleto: alu.nombreCompleto,
      telefono: alu.telefono,
      edad: alu.edad,
      diasPorSemana: alu.diasPorSemana,
      planEntrenamiento: alu.planEntrenamiento,
      lunes: alu.lunes || '',
      martes: alu.martes || '',
      miercoles: alu.miercoles || '',
      jueves: alu.jueves || '',
      viernes: alu.viernes || '',
      correo: alu.correo || '',
      fechaInscripcion: alu.fechaInscripcion || new Date().toISOString().slice(0, 10),
      activo: alu.activo ?? true
    });
    setShowAlumnoModal(true);
  };

  const handleSaveAlumno = async (e) => {
    e.preventDefault();
    if (!user) return;

    const correoSafe =
      alumnoForm.correo && alumnoForm.correo.trim().includes('@')
        ? alumnoForm.correo.trim()
        : `${alumnoForm.nombreCompleto
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '') || 'socio'}@aborogym.com`;

    const payload = {
      ownerUid: gymUid,
      nombreCompleto: alumnoForm.nombreCompleto.trim(),
      telefono: alumnoForm.telefono.trim() || 'Sin teléfono',
      edad: Number(alumnoForm.edad) || 25,
      diasPorSemana: Number(alumnoForm.diasPorSemana),
      planEntrenamiento: alumnoForm.planEntrenamiento,
      lunes: alumnoForm.lunes || '',
      martes: alumnoForm.martes || '',
      miercoles: alumnoForm.miercoles || '',
      jueves: alumnoForm.jueves || '',
      viernes: alumnoForm.viernes || '',
      correo: correoSafe,
      fechaInscripcion: alumnoForm.fechaInscripcion,
      activo: Boolean(alumnoForm.activo)
    };

    try {
      if (editingAlumnoId) {
        const existing = alumnos.find((a) => a.id === editingAlumnoId);
        await updateDoc(doc(db, 'users', gymUid, 'alumnos', editingAlumnoId), {
          ...payload,
          createdAt: existing?.createdAt || new Date().toISOString()
        });
        showToast(`Socio "${payload.nombreCompleto}" actualizado.`);
      } else {
        await addDoc(collection(db, 'users', gymUid, 'alumnos'), {
          ...payload,
          createdAt: new Date().toISOString()
        });
        showToast(`Socio "${payload.nombreCompleto}" agregado.`);
      }
      setShowAlumnoModal(false);
    } catch (err) {
      alert('Error al guardar alumno: ' + err.message);
    }
  };

  const handleDeleteAlumno = async (alu) => {
    if (!user) return;
    if (!window.confirm(`¿Eliminar a "${alu.nombreCompleto}"?`)) return;
    try {
      await deleteDoc(doc(db, 'users', gymUid, 'alumnos', alu.id));
      showToast(`"${alu.nombreCompleto}" eliminado.`);
    } catch (err) {
      alert('Error al eliminar: ' + err.message);
    }
  };

  // ==================== PUBLIC SELF-REGISTRATION HANDLER (WHATSAPP LINK) ====================
  const getSelfRegisterUrl = () => {
    if (!user) return '';
    const baseUrl = window.location.origin;
    return `${baseUrl}/?inscripcion=${encodeURIComponent(gymUid)}&gym=${encodeURIComponent(
      gymConfig.nombre || 'AboroGym'
    )}`;
  };

  const handleCopyInscripcionLink = async () => {
    const url = getSelfRegisterUrl();
    try {
      await navigator.clipboard.writeText(url);
      showToast('🔗 Link de autoinscripción copiado.');
    } catch {
      prompt('Copia este link para enviar a tus alumnos:', url);
    }
  };

  const handleSendWhatsAppLink = () => {
    const url = getSelfRegisterUrl();
    const texto = `¡Hola! Te paso el link de inscripción de *${
      gymConfig.nombre || 'AboroGym'
    }* para que completes tus datos y elijas tus días y horarios:\n\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
  };

  const handlePublicSelfRegister = async (e) => {
    e.preventDefault();
    setPublicError('');

    const diasElegidos = DIAS_SEMANA.filter((d) => Boolean(publicForm[d.key])).length;
    if (diasElegidos === 0) {
      setPublicError('Por favor selecciona al menos un día y horario de entrenamiento.');
      return;
    }

    const correoSafe =
      publicForm.correo && publicForm.correo.trim().includes('@')
        ? publicForm.correo.trim()
        : `${publicForm.nombreCompleto
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '') || 'socio'}@aborogym.com`;

    setPublicBusy(true);
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      await addDoc(collection(db, 'users', inscripcionGymUid, 'alumnos'), {
        ownerUid: inscripcionGymUid,
        nombreCompleto: publicForm.nombreCompleto.trim(),
        telefono: publicForm.telefono.trim(),
        edad: Number(publicForm.edad) || 25,
        diasPorSemana: Number(publicForm.diasPorSemana),
        planEntrenamiento: publicForm.planEntrenamiento,
        lunes: publicForm.lunes || '',
        martes: publicForm.martes || '',
        miercoles: publicForm.miercoles || '',
        jueves: publicForm.jueves || '',
        viernes: publicForm.viernes || '',
        correo: correoSafe,
        fechaInscripcion: todayStr,
        activo: true,
        createdAt: new Date().toISOString()
      });
      setPublicDone(true);
    } catch (err) {
      setPublicError('No se pudo enviar la inscripción: ' + err.message);
    } finally {
      setPublicBusy(false);
    }
  };

  // ==================== 1-TAP FAST CHARGE & COBRANZAS CRUD ====================
  const handleQuickCharge = async (alu, metodoPago) => {
    if (!user || busyId) return;
    setBusyId(alu.id);
    const precio = getPrecioByDias(alu.diasPorSemana);
    try {
      await addDoc(collection(db, 'users', gymUid, 'cobranzas'), {
        ownerUid: gymUid,
        mes: activeMonth,
        alumnoId: alu.id,
        alumnoNombre: alu.nombreCompleto,
        dias: Number(alu.diasPorSemana),
        precioCuota: precio,
        actividad: alu.planEntrenamiento,
        metodoPago,
        descuentoInscripcion: 0,
        totalPagado: precio,
        observaciones: 'Cobro rápido',
        fechaPago: new Date().toISOString().slice(0, 10),
        createdAt: new Date().toISOString()
      });
      showToast(`✅ ${alu.nombreCompleto} cobrado (${metodoPago} • ${formatCurrency(precio)})`);
    } catch (err) {
      alert('Error en cobro rápido: ' + err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleSelectAlumnoForCobranza = (alumnoId) => {
    const found = alumnos.find((a) => a.id === alumnoId);
    if (!found) {
      setCobranzaForm((prev) => ({ ...prev, alumnoId: '' }));
      return;
    }
    setCobranzaForm((prev) => ({
      ...prev,
      alumnoId: found.id,
      dias: found.diasPorSemana,
      precioCuota: getPrecioByDias(found.diasPorSemana),
      actividad: found.planEntrenamiento
    }));
  };

  const handleSaveManualCobranza = async (e) => {
    e.preventDefault();
    if (!user) return;
    const foundAlumno = alumnos.find((a) => a.id === cobranzaForm.alumnoId);
    if (!foundAlumno) {
      alert('Selecciona un alumno.');
      return;
    }

    const precioBase = Number(cobranzaForm.precioCuota) || 0;
    const ajuste = Number(cobranzaForm.descuentoInscripcion) || 0;
    const totalPagado = Math.max(0, precioBase + ajuste);

    try {
      await addDoc(collection(db, 'users', gymUid, 'cobranzas'), {
        ownerUid: gymUid,
        mes: activeMonth,
        alumnoId: foundAlumno.id,
        alumnoNombre: foundAlumno.nombreCompleto,
        dias: Number(cobranzaForm.dias),
        precioCuota: precioBase,
        actividad: cobranzaForm.actividad,
        metodoPago: cobranzaForm.metodoPago,
        descuentoInscripcion: ajuste,
        totalPagado,
        observaciones: (cobranzaForm.observaciones || 'Cuota al día').trim(),
        fechaPago: cobranzaForm.fechaPago || new Date().toISOString().slice(0, 10),
        createdAt: new Date().toISOString()
      });

      setCobranzaForm((prev) => ({
        ...prev,
        alumnoId: '',
        descuentoInscripcion: 0,
        observaciones: ''
      }));
      showToast(`Pago guardado para ${foundAlumno.nombreCompleto}`);
    } catch (err) {
      alert('Error al guardar pago: ' + err.message);
    }
  };

  const handleDeleteCobranza = async (cob) => {
    if (!user) return;
    if (!window.confirm(`¿Borrar pago de ${cob.alumnoNombre} (${cob.mes})?`)) return;
    try {
      await deleteDoc(doc(db, 'users', gymUid, 'cobranzas', cob.id));
      showToast('Pago eliminado.');
    } catch (err) {
      alert('Error al eliminar pago: ' + err.message);
    }
  };

  const saveConfigPayload = async (customEmailsList = null) => {
    if (!user) return;
    const profPct = Number(tarifasForm.porcentajeProfesor) ?? 67;
    const gymPct = Number(tarifasForm.porcentajeGym) ?? 33;
    const rawEmails = customEmailsList || tarifasForm.emailsAutorizados || gymConfig.emailsAutorizados || [PRIMARY_ADMIN_EMAIL];
    const cleanEmails = Array.from(
      new Set([
        PRIMARY_ADMIN_EMAIL,
        ...rawEmails.map((em) => String(em).toLowerCase().trim()).filter((em) => em.includes('@'))
      ])
    ).slice(0, 20);

    await setDoc(doc(db, 'users', gymUid, 'config', 'general'), {
      ownerUid: gymUid,
      nombre: (tarifasForm.nombre || DEFAULT_GYM_CONFIG.nombre).trim(),
      sede: (tarifasForm.sede || DEFAULT_GYM_CONFIG.sede).trim(),
      tarifa2Dias: Number(tarifasForm.tarifa2Dias) || 0,
      tarifa3Dias: Number(tarifasForm.tarifa3Dias) || 0,
      tarifa5Dias: Number(tarifasForm.tarifa5Dias) || 0,
      porcentajeProfesor: profPct,
      porcentajeGym: gymPct,
      cupoMaximoDefault: Number(tarifasForm.cupoMaximoDefault) || 12,
      emailsAutorizados: cleanEmails,
      updatedAt: new Date().toISOString()
    });
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    try {
      await saveConfigPayload();
      showToast('Tarifas y configuración guardadas.');
    } catch (err) {
      alert('Error al guardar configuración: ' + err.message);
    }
  };

  const handleAddAuthorizedEmail = async () => {
    const clean = newAllowedEmail.toLowerCase().trim();
    if (!clean || !clean.includes('@')) {
      alert('Ingresa un correo de Google válido.');
      return;
    }
    const currentList = Array.isArray(gymConfig.emailsAutorizados)
      ? gymConfig.emailsAutorizados
      : [PRIMARY_ADMIN_EMAIL];
    if (currentList.map((e) => e.toLowerCase()).includes(clean)) {
      setNewAllowedEmail('');
      showToast('Ese correo ya está autorizado.');
      return;
    }
    const updated = [...currentList, clean];
    try {
      await saveConfigPayload(updated);
      setNewAllowedEmail('');
      showToast(`✅ Acceso con Google habilitado para ${clean}`);
    } catch (err) {
      alert('Error al autorizar correo: ' + err.message);
    }
  };

  const handleRemoveAuthorizedEmail = async (emailToRemove) => {
    const clean = String(emailToRemove).toLowerCase().trim();
    if (clean === PRIMARY_ADMIN_EMAIL) {
      alert('No se puede eliminar al administrador principal.');
      return;
    }
    const currentList = Array.isArray(gymConfig.emailsAutorizados)
      ? gymConfig.emailsAutorizados
      : [PRIMARY_ADMIN_EMAIL];
    const updated = currentList.filter((e) => e.toLowerCase().trim() !== clean);
    try {
      await saveConfigPayload(updated);
      showToast(`Acceso quitado para ${clean}`);
    } catch (err) {
      alert('Error al quitar correo: ' + err.message);
    }
  };

  // ==================== DERIVED METRICS & LISTS ====================
  const cupoMaximo = Number(gymConfig.cupoMaximoDefault) || 12;

  const getDatosMes = (mesNombre) => {
    const pagosMes = cobranzas.filter((c) => c.mes === mesNombre);
    const paidIds = new Set(pagosMes.map((c) => c.alumnoId));
    const activos = alumnos.filter((a) => a.activo !== false);
    const pendientes = activos.filter((a) => !paidIds.has(a.id));

    const totalRecaudado = pagosMes.reduce((s, c) => s + (Number(c.totalPagado) || 0), 0);
    const efectivo = pagosMes
      .filter((c) => c.metodoPago === 'Efectivo')
      .reduce((s, c) => s + (Number(c.totalPagado) || 0), 0);
    const transferencia = pagosMes
      .filter((c) => c.metodoPago === 'Transferencia')
      .reduce((s, c) => s + (Number(c.totalPagado) || 0), 0);

    const pctProf = Number(gymConfig.porcentajeProfesor) || 67;
    const pctGym = Number(gymConfig.porcentajeGym) || 33;
    const liqProfesor = Math.round((totalRecaudado * pctProf) / 100);
    const netoGym = Math.round((totalRecaudado * pctGym) / 100);

    const cobradosCount = activos.length - pendientes.length;
    const progresoPct = activos.length > 0 ? Math.round((cobradosCount / activos.length) * 100) : 0;

    return {
      pagosMes,
      paidIds,
      activos,
      pendientes,
      cobradosCount,
      progresoPct,
      totalRecaudado,
      efectivo,
      transferencia,
      liqProfesor,
      netoGym
    };
  };

  const mesData = useMemo(
    () => getDatosMes(activeMonth),
    [cobranzas, alumnos, activeMonth, gymConfig]
  );

  const filteredPendientes = useMemo(() => {
    const q = searchPendiente.toLowerCase().trim();
    if (!q) return mesData.pendientes;
    return mesData.pendientes.filter(
      (a) =>
        a.nombreCompleto.toLowerCase().includes(q) ||
        a.planEntrenamiento.toLowerCase().includes(q)
    );
  }, [mesData.pendientes, searchPendiente]);

  const filteredAlumnos = useMemo(() => {
    return alumnos.filter((a) => {
      const q = searchAlumno.toLowerCase().trim();
      const matchSearch =
        !q ||
        a.nombreCompleto.toLowerCase().includes(q) ||
        a.telefono.toLowerCase().includes(q) ||
        a.planEntrenamiento.toLowerCase().includes(q);
      const matchDias = filterDias === 'TODOS' || Number(a.diasPorSemana) === Number(filterDias);
      return matchSearch && matchDias;
    });
  }, [alumnos, searchAlumno, filterDias]);

  const turnosMatrix = useMemo(() => {
    const matrix = {};
    for (const hora of FRANJAS_HORARIAS) {
      matrix[hora] = {};
      for (const d of DIAS_SEMANA) {
        const anotados = alumnos.filter((a) => a.activo !== false && a[d.key] === hora);
        const count = anotados.length;
        const disponibles = Math.max(0, cupoMaximo - count);
        matrix[hora][d.key] = { inscriptos: anotados, count, disponibles };
      }
    }
    return matrix;
  }, [alumnos, cupoMaximo]);

  const statsExtras = useMemo(() => {
    const activos = alumnos.filter((a) => a.activo !== false);
    const porPlan = PLANES_ENTRENAMIENTO.map((plan) => {
      const count = activos.filter((a) => a.planEntrenamiento === plan).length;
      const pct = activos.length > 0 ? Math.round((count / activos.length) * 100) : 0;
      return { plan, count, pct };
    }).filter((p) => p.count > 0 || activos.length === 0);

    const capMaxFranja = cupoMaximo * DIAS_SEMANA.length;
    const porFranja = FRANJAS_HORARIAS.map((hora) => {
      let totalHora = 0;
      for (const d of DIAS_SEMANA) {
        totalHora += turnosMatrix[hora]?.[d.key]?.count || 0;
      }
      const pct = capMaxFranja > 0 ? Math.round((totalHora / capMaxFranja) * 100) : 0;
      return { hora, totalHora, capMaxFranja, pct };
    });

    return { porPlan, porFranja };
  }, [alumnos, turnosMatrix, cupoMaximo]);

  // ==================== CUSTOM PDF EXPORT GENERATOR ====================
  const handleGeneratePDF = (e) => {
    e.preventDefault();
    const {
      mes,
      metodoFiltro,
      incluirResumenFinanciero,
      incluirPagosDelMes,
      incluirPendientesDePago,
      incluirPadronAlumnos,
      incluirOcupacionTurnos
    } = pdfOptions;

    if (
      !incluirResumenFinanciero &&
      !incluirPagosDelMes &&
      !incluirPendientesDePago &&
      !incluirPadronAlumnos &&
      !incluirOcupacionTurnos
    ) {
      alert('Selecciona al menos un bloque de datos para exportar al PDF.');
      return;
    }

    const datos = getDatosMes(mes);
    const docPdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // Header Banner
    docPdf.setFillColor(72, 156, 200);
    docPdf.rect(0, 0, 210, 26, 'F');
    docPdf.setTextColor(255, 255, 255);
    docPdf.setFontSize(16);
    docPdf.setFont('helvetica', 'bold');
    docPdf.text(`${gymConfig.nombre} — Reporte Mensual (${mes})`, 14, 12);

    docPdf.setFontSize(9.5);
    docPdf.setFont('helvetica', 'normal');
    docPdf.text(
      `Sede: ${gymConfig.sede}   |   Fecha de emisión: ${new Date().toLocaleDateString('es-AR')}`,
      14,
      19.5
    );

    let currentY = 33;

    // 1. Resumen Financiero del Mes
    if (incluirResumenFinanciero) {
      docPdf.setTextColor(72, 156, 200);
      docPdf.setFontSize(12);
      docPdf.setFont('helvetica', 'bold');
      docPdf.text(`1. Resumen Financiero — ${mes}`, 14, currentY);
      currentY += 3;

      autoTable(docPdf, {
        startY: currentY,
        head: [['Concepto', 'Detalle / Porcentaje', 'Monto']],
        body: [
          ['Total Recaudado del Mes', `${datos.pagosMes.length} pagos registrados`, formatCurrency(datos.totalRecaudado)],
          ['Subtotal Efectivo', 'Caja física', formatCurrency(datos.efectivo)],
          ['Subtotal Transferencia', 'Acreditación bancaria', formatCurrency(datos.transferencia)],
          [
            'Liquidación Profesor',
            `${gymConfig.porcentajeProfesor}% sobre recaudación`,
            formatCurrency(datos.liqProfesor)
          ],
          [
            'Utilidad Neta Gimnasio',
            `${gymConfig.porcentajeGym}% sobre recaudación`,
            formatCurrency(datos.netoGym)
          ],
          [
            'Estado de Cobranza',
            `${datos.cobradosCount} al día / ${datos.pendientes.length} pendientes`,
            `${datos.progresoPct}% cobrado`
          ]
        ],
        theme: 'grid',
        headStyles: { fillColor: [72, 156, 200], fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        columnStyles: { 2: { halign: 'right', fontStyle: 'bold' } }
      });

      currentY = docPdf.lastAutoTable.finalY + 9;
    }

    // 2. Detalle de Cobranzas / Pagos del Mes
    if (incluirPagosDelMes) {
      const pagosFiltrados = datos.pagosMes.filter(
        (p) => metodoFiltro === 'TODOS' || p.metodoPago === metodoFiltro
      );

      if (currentY > 250) {
        docPdf.addPage();
        currentY = 18;
      }

      docPdf.setTextColor(72, 156, 200);
      docPdf.setFontSize(12);
      docPdf.setFont('helvetica', 'bold');
      docPdf.text(
        `Pagos Registrados en ${mes} (${
          metodoFiltro === 'TODOS' ? 'Todos los métodos' : metodoFiltro
        })`,
        14,
        currentY
      );
      currentY += 3;

      autoTable(docPdf, {
        startY: currentY,
        head: [['#', 'Alumno', 'Días', 'Actividad', 'Método', 'Fecha', 'Total']],
        body:
          pagosFiltrados.length === 0
            ? [['-', 'Sin pagos registrados para este filtro', '-', '-', '-', '-', '$0']]
            : pagosFiltrados.map((c, idx) => [
                idx + 1,
                c.alumnoNombre,
                `${c.dias}d`,
                c.actividad,
                c.metodoPago,
                c.fechaPago,
                formatCurrency(c.totalPagado)
              ]),
        theme: 'striped',
        headStyles: { fillColor: [44, 109, 145], fontSize: 8.5 },
        bodyStyles: { fontSize: 8.5 },
        columnStyles: { 6: { halign: 'right', fontStyle: 'bold' } }
      });

      currentY = docPdf.lastAutoTable.finalY + 9;
    }

    // 3. Alumnos Pendientes de Pago en el Mes
    if (incluirPendientesDePago) {
      if (currentY > 250) {
        docPdf.addPage();
        currentY = 18;
      }

      docPdf.setTextColor(180, 83, 9);
      docPdf.setFontSize(12);
      docPdf.setFont('helvetica', 'bold');
      docPdf.text(
        `Socios Pendientes de Pago — ${mes} (${datos.pendientes.length})`,
        14,
        currentY
      );
      currentY += 3;

      autoTable(docPdf, {
        startY: currentY,
        head: [['#', 'Alumno', 'Teléfono', 'Días/Sem', 'Plan', 'Cuota a Cobrar']],
        body:
          datos.pendientes.length === 0
            ? [['-', 'Todos los alumnos activos están al día en este mes', '-', '-', '-', '$0']]
            : datos.pendientes.map((a, idx) => [
                idx + 1,
                a.nombreCompleto,
                a.telefono,
                `${a.diasPorSemana} días`,
                a.planEntrenamiento,
                formatCurrency(getPrecioByDias(a.diasPorSemana))
              ]),
        theme: 'striped',
        headStyles: { fillColor: [217, 119, 6], fontSize: 8.5 },
        bodyStyles: { fontSize: 8.5 },
        columnStyles: { 5: { halign: 'right', fontStyle: 'bold' } }
      });

      currentY = docPdf.lastAutoTable.finalY + 9;
    }

    // 4. Padrón Completo de Alumnos Activos
    if (incluirPadronAlumnos) {
      if (currentY > 240) {
        docPdf.addPage();
        currentY = 18;
      }

      docPdf.setTextColor(72, 156, 200);
      docPdf.setFontSize(12);
      docPdf.setFont('helvetica', 'bold');
      docPdf.text(`Padrón de Alumnos Activos (${datos.activos.length})`, 14, currentY);
      currentY += 3;

      autoTable(docPdf, {
        startY: currentY,
        head: [['#', 'Nombre', 'Teléfono', 'Edad', 'Días', 'Plan', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie']],
        body:
          datos.activos.length === 0
            ? [['-', 'Sin alumnos cargados', '-', '-', '-', '-', '-', '-', '-', '-', '-']]
            : datos.activos.map((a, idx) => [
                idx + 1,
                a.nombreCompleto,
                a.telefono,
                a.edad,
                `${a.diasPorSemana}d`,
                a.planEntrenamiento,
                a.lunes || '-',
                a.martes || '-',
                a.miercoles || '-',
                a.jueves || '-',
                a.viernes || '-'
              ]),
        theme: 'grid',
        headStyles: { fillColor: [72, 156, 200], fontSize: 8 },
        bodyStyles: { fontSize: 7.5 }
      });

      currentY = docPdf.lastAutoTable.finalY + 9;
    }

    // 5. Grilla de Turnos y Ocupación Semanal
    if (incluirOcupacionTurnos) {
      if (currentY > 235) {
        docPdf.addPage();
        currentY = 18;
      }

      docPdf.setTextColor(72, 156, 200);
      docPdf.setFontSize(12);
      docPdf.setFont('helvetica', 'bold');
      docPdf.text(`Ocupación de Turnos (Cupo Máx: ${cupoMaximo} por horario)`, 14, currentY);
      currentY += 3;

      autoTable(docPdf, {
        startY: currentY,
        head: [
          [
            'Horario',
            'Lunes (Insc/Lib)',
            'Martes (Insc/Lib)',
            'Miércoles (Insc/Lib)',
            'Jueves (Insc/Lib)',
            'Viernes (Insc/Lib)'
          ]
        ],
        body: FRANJAS_HORARIAS.map((h) => [
          `${h} hs`,
          `${turnosMatrix[h].lunes.count}/${turnosMatrix[h].lunes.disponibles}`,
          `${turnosMatrix[h].martes.count}/${turnosMatrix[h].martes.disponibles}`,
          `${turnosMatrix[h].miercoles.count}/${turnosMatrix[h].miercoles.disponibles}`,
          `${turnosMatrix[h].jueves.count}/${turnosMatrix[h].jueves.disponibles}`,
          `${turnosMatrix[h].viernes.count}/${turnosMatrix[h].viernes.disponibles}`
        ]),
        theme: 'grid',
        headStyles: { fillColor: [72, 156, 200], fontSize: 8.5 },
        bodyStyles: { fontSize: 8.5, halign: 'center' }
      });
    }

    docPdf.save(`AboroGym_${mes}.pdf`);
    setShowPdfModal(false);
    showToast(`📄 PDF de ${mes} descargado.`);
  };

  // ==================== PUBLIC SELF-REGISTRATION SCREEN (FOR ALUMNOS) ====================
  if (inscripcionGymUid) {
    const diasSeleccionadosCount = DIAS_SEMANA.filter((d) => Boolean(publicForm[d.key])).length;

    return (
      <div className="auth-mobile-screen" style={{ alignItems: 'flex-start', paddingTop: '1.5rem' }}>
        <div className="auth-card" style={{ maxWidth: 460 }}>
          <div className="auth-brand-row">
            <div className="auth-logo-badge">
              <img src="/logo.png" alt="AboroGym" className="brand-logo-img" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1d4963' }}>
                {inscripcionGymName}
              </h2>
              <p style={{ fontSize: '0.76rem', color: '#489cc8', fontWeight: 700 }}>
                Ficha de Autoinscripción de Alumno
              </p>
            </div>
          </div>

          {publicDone ? (
            <div style={{ textAlign: 'center', padding: '1rem 0.25rem' }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  background: '#d8ecf6',
                  color: '#489cc8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 0.85rem'
                }}
              >
                <CheckCircle2 size={30} />
              </div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1d4963', marginBottom: 6 }}>
                ¡Inscripción Enviada!
              </h3>
              <p style={{ fontSize: '0.84rem', color: '#475569', marginBottom: '1rem' }}>
                Hola <strong>{publicForm.nombreCompleto}</strong>, tus datos y horarios ya quedaron
                registrados en <strong>{inscripcionGymName}</strong>.
              </p>

              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  padding: '0.75rem',
                  marginBottom: '1rem',
                  fontSize: '0.8rem',
                  textAlign: 'left'
                }}
              >
                <div>
                  <strong>Plan:</strong> {publicForm.planEntrenamiento} ({publicForm.diasPorSemana}{' '}
                  días/sem)
                </div>
                <div style={{ marginTop: 6 }} className="schedule-chips">
                  {DIAS_SEMANA.map((d) =>
                    publicForm[d.key] ? (
                      <span key={d.key} className="schedule-chip">
                        {d.label}: {publicForm[d.key]} hs
                      </span>
                    ) : null
                  )}
                </div>
              </div>

              <button
                type="button"
                className="btn btn-secondary btn-full"
                onClick={() => {
                  setPublicDone(false);
                  setPublicForm({
                    nombreCompleto: '',
                    telefono: '',
                    edad: '',
                    diasPorSemana: 3,
                    planEntrenamiento: 'Funcional',
                    lunes: '',
                    martes: '',
                    miercoles: '',
                    jueves: '',
                    viernes: '',
                    correo: ''
                  });
                }}
              >
                Inscribir otra persona
              </button>

              {user && (
                <button
                  type="button"
                  className="btn btn-emerald-soft btn-full"
                  style={{ marginTop: '0.5rem' }}
                  onClick={() => {
                    window.history.replaceState({}, '', window.location.pathname);
                    setInscripcionGymUid('');
                  }}
                >
                  Volver al Panel del Gimnasio
                </button>
              )}
            </div>
          ) : (
            <form onSubmit={handlePublicSelfRegister}>
              {publicError && (
                <div className="alert-box alert-error">
                  <AlertCircle size={15} />
                  <span>{publicError}</span>
                </div>
              )}

              <div className="form-group">
                <label>Nombre y Apellido *</label>
                <input
                  type="text"
                  required
                  className="input-control"
                  value={publicForm.nombreCompleto}
                  onChange={(e) =>
                    setPublicForm({ ...publicForm, nombreCompleto: e.target.value })
                  }
                />
              </div>

              <div className="form-grid-2" style={{ marginBottom: '0.75rem' }}>
                <div>
                  <label className="field-label">Teléfono / WhatsApp *</label>
                  <input
                    type="tel"
                    required
                    className="input-control"
                    value={publicForm.telefono}
                    onChange={(e) => setPublicForm({ ...publicForm, telefono: e.target.value })}
                  />
                </div>
                <div>
                  <label className="field-label">Edad *</label>
                  <input
                    type="number"
                    min={5}
                    max={110}
                    required
                    className="input-control mono"
                    value={publicForm.edad}
                    onChange={(e) => setPublicForm({ ...publicForm, edad: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-grid-2" style={{ marginBottom: '0.75rem' }}>
                <div>
                  <label className="field-label">Días por Semana *</label>
                  <select
                    className="select-control"
                    value={publicForm.diasPorSemana}
                    onChange={(e) =>
                      setPublicForm({ ...publicForm, diasPorSemana: Number(e.target.value) })
                    }
                  >
                    <option value={2}>2 días / semana</option>
                    <option value={3}>3 días / semana</option>
                    <option value={5}>5 días / semana</option>
                  </select>
                </div>
                <div>
                  <label className="field-label">Actividad / Plan *</label>
                  <select
                    className="select-control"
                    value={publicForm.planEntrenamiento}
                    onChange={(e) =>
                      setPublicForm({ ...publicForm, planEntrenamiento: e.target.value })
                    }
                  >
                    {PLANES_ENTRENAMIENTO.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.35rem'
                }}
              >
                <label className="field-label" style={{ marginBottom: 0 }}>
                  Elegí tus Horarios
                </label>
                <span className="badge badge-emerald">
                  {diasSeleccionadosCount} / {publicForm.diasPorSemana} días elegidos
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '0.5rem',
                  marginBottom: '0.85rem',
                  background: '#f8fafc',
                  padding: '0.65rem',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0'
                }}
              >
                {DIAS_SEMANA.map((d) => (
                  <div key={d.key}>
                    <label className="field-label" style={{ color: '#2c6d91' }}>
                      {d.label}
                    </label>
                    <select
                      className="select-control mono"
                      style={{ padding: '0.42rem 0.5rem', fontSize: '0.82rem' }}
                      value={publicForm[d.key]}
                      onChange={(e) => setPublicForm({ ...publicForm, [d.key]: e.target.value })}
                    >
                      <option value="">— No asisto —</option>
                      {FRANJAS_HORARIAS.map((h) => (
                        <option key={h} value={h}>
                          {h} hs
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="form-group">
                <label>Correo Electrónico (opcional)</label>
                <input
                  type="email"
                  className="input-control"
                  value={publicForm.correo}
                  onChange={(e) => setPublicForm({ ...publicForm, correo: e.target.value })}
                />
              </div>

              <button type="submit" className="btn btn-primary btn-full" disabled={publicBusy}>
                {publicBusy ? 'Enviando inscripción...' : 'Confirmar Inscripción'}
              </button>

              {user && (
                <button
                  type="button"
                  className="btn btn-secondary btn-full"
                  style={{ marginTop: '0.5rem' }}
                  onClick={() => {
                    window.history.replaceState({}, '', window.location.pathname);
                    setInscripcionGymUid('');
                  }}
                >
                  Volver al Panel del Gimnasio
                </button>
              )}
            </form>
          )}
        </div>
      </div>
    );
  }

  // ==================== LOADING & AUTH SCREENS ====================
  if (authLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0b1926',
          color: 'white',
          fontWeight: 700,
          gap: '1rem'
        }}
      >
        <img
          src="/logo.png"
          alt="AboroGym"
          style={{ width: 68, height: 68, objectFit: 'contain' }}
        />
        <span style={{ fontSize: '1rem', letterSpacing: '0.02em', color: '#d8ecf6' }}>
          Cargando AboroGym...
        </span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="auth-mobile-screen">
        <div className="auth-card">
          <div className="auth-brand-row">
            <div className="auth-logo-badge">
              <img src="/logo.png" alt="AboroGym" className="brand-logo-img" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1d4963' }}>AboroGym</h2>
              <p style={{ fontSize: '0.76rem', color: '#64748b' }}>
                Acceso exclusivo para administradores
              </p>
            </div>
          </div>

          {authError && (
            <div className="alert-box alert-error">
              <AlertCircle size={15} />
              <span>{authError}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={authBusy}
            className="btn btn-primary btn-full"
            style={{
              padding: '0.82rem 1rem',
              fontSize: '0.92rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.55rem'
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#ffffff"
                d="M21.35 11.1h-9.17v2.73h6.51c-.33 1.81-1.5 3.34-3.2 4.37v3.62h5.18c3.03-2.79 4.78-6.9 4.78-11.82 0-.62-.06-1.25-.1-1.9z"
              />
              <path
                fill="#d8ecf6"
                d="M12.18 22c4.32 0 7.95-1.43 10.6-3.88l-5.18-3.62c-1.43.96-3.26 1.53-5.42 1.53-4.17 0-7.7-2.81-8.96-6.6H-2.1v3.73C.54 18.42 5.93 22 12.18 22z"
              />
            </svg>
            <span>{authBusy ? 'Conectando con Google...' : 'Iniciar sesión con Google'}</span>
          </button>

          <p
            style={{
              fontSize: '0.74rem',
              color: '#64748b',
              textAlign: 'center',
              marginTop: '0.65rem',
              lineHeight: 1.4
            }}
          >
            Solo pueden ingresar las cuentas de Google habilitadas por el administrador del
            gimnasio.
          </p>

          <div className="auth-divider">
            <span>o</span>
          </div>

          {!showEmailLogin ? (
            <button
              type="button"
              className="btn btn-secondary btn-full btn-sm"
              onClick={() => {
                setShowEmailLogin(true);
                setAuthError('');
              }}
            >
              Ingresar con correo y contraseña
            </button>
          ) : (
            <form onSubmit={handleEmailAuth}>
              <div className="form-group">
                <label>Correo</label>
                <input
                  type="email"
                  required
                  className="input-control"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Contraseña</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  className="input-control"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-secondary btn-full" disabled={authBusy}>
                {authBusy ? 'Ingresando...' : 'Entrar con contraseña'}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  if (configLoaded && accessDenied) {
    return (
      <div className="auth-mobile-screen">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div
            className="auth-logo-badge"
            style={{ margin: '0 auto 0.75rem', width: 52, height: 52 }}
          >
            <img src="/logo.png" alt="AboroGym" className="brand-logo-img" />
          </div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1d4963' }}>
            Cuenta no autorizada
          </h2>
          <p
            style={{
              fontSize: '0.82rem',
              color: '#475569',
              margin: '0.55rem 0 1rem',
              lineHeight: 1.45
            }}
          >
            La cuenta <strong>{user.email}</strong> no está en la lista de correos habilitados de{' '}
            <strong>{gymConfig.nombre || 'AboroGym'}</strong>. Pedile al administrador que agregue
            tu correo de Google desde la sección <em>Tarifas / Accesos</em>.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-full"
            onClick={() => signOut(auth)}
          >
            Cambiar de cuenta Google
          </button>
        </div>
      </div>
    );
  }

  // ==================== MAIN AUTHENTICATED APP ====================
  return (
    <div className="app-shell">
      {/* Compact Sticky Header */}
      <header className="app-header">
        <div className="header-brand">
          <div className="header-icon">
            <img src="/logo.png" alt="AboroGym" className="header-logo-img" />
          </div>
          <div className="header-titles">
            <h1>{gymConfig.nombre}</h1>
            <p>
              {activeMonth} • {mesData.activos.length} socios
            </p>
          </div>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="header-btn accent"
            onClick={openNewAlumnoModal}
            title="Agregar nuevo alumno"
          >
            <UserPlus size={15} />
            <span>+ Alumno</span>
          </button>

          <button
            type="button"
            className="header-btn"
            onClick={() => setShowShareModal(true)}
            title="Compartir link de autoinscripción por WhatsApp"
          >
            <Share2 size={15} />
            <span>Link</span>
          </button>

          <button
            type="button"
            className="header-btn"
            onClick={() => {
              setPdfOptions((prev) => ({ ...prev, mes: activeMonth }));
              setShowPdfModal(true);
            }}
            title="Exportar reporte en PDF"
          >
            <FileText size={15} />
            <span>PDF</span>
          </button>

          <button
            type="button"
            className="header-btn"
            onClick={() => signOut(auth)}
            title="Cerrar sesión"
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      {/* Active Month Selector Bar */}
      <div className="month-bar">
        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#475569' }}>MES:</span>
        <div className="month-pills">
          {['Octubre', 'Noviembre', 'Diciembre', 'Enero', 'Febrero', 'Marzo'].map((m) => (
            <button
              key={m}
              type="button"
              className={`month-pill ${activeMonth === m ? 'active' : ''}`}
              onClick={() => setActiveMonth(m)}
            >
              {m}
            </button>
          ))}
          <select
            value={activeMonth}
            onChange={(e) => setActiveMonth(e.target.value)}
            style={{
              fontSize: '0.74rem',
              padding: '0.25rem 0.45rem',
              borderRadius: 999,
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              fontWeight: 700,
              color: '#334155'
            }}
          >
            {MESES_COBRANZA.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Toast Notification */}
      {statusBanner && (
        <div className="toast-banner">
          <CheckCircle2 size={15} color="#489cc8" />
          <span>{statusBanner}</span>
        </div>
      )}

      {/* ==================== MAIN CONTENT ==================== */}
      <main className="main-content">
        {/* ==================== TAB 1: DASHBOARD ==================== */}
        {activeTab === 'Dashboard' && (
          <div>
            {/* 4 Quick Action Buttons */}
            <div className="quick-actions-grid">
              <button type="button" className="quick-action-btn primary" onClick={openNewAlumnoModal}>
                <div className="quick-action-icon">
                  <UserPlus size={18} />
                </div>
                <div className="quick-action-text">
                  <strong>+ Alumno</strong>
                  <span>Nuevo socio</span>
                </div>
              </button>

              <button
                type="button"
                className="quick-action-btn"
                onClick={() => {
                  setOpenSections((prev) => ({ ...prev, dashFastCharge: true }));
                  document
                    .getElementById('fast-charge-section')
                    ?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                <div className="quick-action-icon">
                  <Zap size={18} />
                </div>
                <div className="quick-action-text">
                  <strong>Cobro Rápido</strong>
                  <span>{mesData.pendientes.length} pendientes</span>
                </div>
              </button>

              <button
                type="button"
                className="quick-action-btn"
                onClick={() => {
                  setPdfOptions((prev) => ({ ...prev, mes: activeMonth }));
                  setShowPdfModal(true);
                }}
              >
                <div className="quick-action-icon">
                  <FileText size={18} />
                </div>
                <div className="quick-action-text">
                  <strong>Exportar PDF</strong>
                  <span>Elegir datos</span>
                </div>
              </button>

              <button
                type="button"
                className="quick-action-btn"
                onClick={() => {
                  setOpenSections((prev) => ({ ...prev, dashConfig: !prev.dashConfig }));
                }}
              >
                <div className="quick-action-icon">
                  <Settings size={18} />
                </div>
                <div className="quick-action-text">
                  <strong>Tarifas / Google</strong>
                  <span>Cupo: {cupoMaximo}</span>
                </div>
              </button>
            </div>

            {/* 2x2 Compact KPI Cards */}
            <div className="kpi-grid-compact">
              <div className="kpi-box highlight">
                <div className="kpi-box-label">
                  <span>RECAUDADO ({activeMonth.slice(0, 3).toUpperCase()})</span>
                  <DollarSign size={14} />
                </div>
                <div className="kpi-box-val">{formatCurrency(mesData.totalRecaudado)}</div>
                <div className="kpi-box-sub">
                  Efec: {formatCurrency(mesData.efectivo)} • Transf:{' '}
                  {formatCurrency(mesData.transferencia)}
                </div>
              </div>

              <div className="kpi-box">
                <div className="kpi-box-label">
                  <span>COBRADOS EN {activeMonth.slice(0, 3).toUpperCase()}</span>
                  <span className="badge badge-emerald">{mesData.progresoPct}%</span>
                </div>
                <div className="kpi-box-val" style={{ color: '#1d4963' }}>
                  {mesData.cobradosCount} / {mesData.activos.length}
                </div>
                <div className="kpi-box-sub">{mesData.pendientes.length} faltan pagar</div>
              </div>

              <div className="kpi-box">
                <div className="kpi-box-label">
                  <span>NETO GYM ({gymConfig.porcentajeGym}%)</span>
                </div>
                <div className="kpi-box-val" style={{ color: '#489cc8' }}>
                  {formatCurrency(mesData.netoGym)}
                </div>
                <div className="kpi-box-sub">
                  Prof ({gymConfig.porcentajeProfesor}%): {formatCurrency(mesData.liqProfesor)}
                </div>
              </div>

              <div className="kpi-box">
                <div className="kpi-box-label">
                  <span>ALUMNOS ACTIVOS</span>
                  <Users size={14} />
                </div>
                <div className="kpi-box-val">{mesData.activos.length}</div>
                <div className="kpi-box-sub">Cupo máx: {cupoMaximo} / turno</div>
              </div>
            </div>

            {/* Collapsible Config Panel (when toggled) */}
            {openSections.dashConfig && (
              <div className="accordion-card">
                <button
                  type="button"
                  className="accordion-header emerald"
                  onClick={() => toggleSection('dashConfig')}
                >
                  <div className="accordion-title">
                    <Settings size={16} />
                    <span>Tarifas, Cupo y Accesos con Google</span>
                  </div>
                  <ChevronDown size={18} />
                </button>
                <form className="accordion-body" onSubmit={handleSaveConfig}>
                  <div className="form-grid-2" style={{ marginBottom: '0.65rem' }}>
                    <div>
                      <label className="field-label">Nombre Gimnasio</label>
                      <input
                        type="text"
                        required
                        className="input-control"
                        value={tarifasForm.nombre || ''}
                        onChange={(e) =>
                          setTarifasForm({ ...tarifasForm, nombre: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="field-label">Cupo Máx. por Turno</label>
                      <input
                        type="number"
                        min={1}
                        max={200}
                        className="input-control mono"
                        value={tarifasForm.cupoMaximoDefault}
                        onChange={(e) =>
                          setTarifasForm({
                            ...tarifasForm,
                            cupoMaximoDefault: Number(e.target.value)
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="form-grid-3" style={{ marginBottom: '0.65rem' }}>
                    <div>
                      <label className="field-label">2 Días ($)</label>
                      <input
                        type="number"
                        className="input-control mono"
                        value={tarifasForm.tarifa2Dias}
                        onChange={(e) =>
                          setTarifasForm({ ...tarifasForm, tarifa2Dias: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="field-label">3 Días ($)</label>
                      <input
                        type="number"
                        className="input-control mono"
                        value={tarifasForm.tarifa3Dias}
                        onChange={(e) =>
                          setTarifasForm({ ...tarifasForm, tarifa3Dias: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="field-label">5 Días ($)</label>
                      <input
                        type="number"
                        className="input-control mono"
                        value={tarifasForm.tarifa5Dias}
                        onChange={(e) =>
                          setTarifasForm({ ...tarifasForm, tarifa5Dias: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  <div className="form-grid-2" style={{ marginBottom: '0.75rem' }}>
                    <div>
                      <label className="field-label">% Profesor</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className="input-control mono"
                        value={tarifasForm.porcentajeProfesor}
                        onChange={(e) => {
                          const p = Number(e.target.value);
                          setTarifasForm({
                            ...tarifasForm,
                            porcentajeProfesor: p,
                            porcentajeGym: Math.max(0, 100 - p)
                          });
                        }}
                      />
                    </div>
                    <div>
                      <label className="field-label">% Gimnasio</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className="input-control mono"
                        value={tarifasForm.porcentajeGym}
                        onChange={(e) => {
                          const g = Number(e.target.value);
                          setTarifasForm({
                            ...tarifasForm,
                            porcentajeGym: g,
                            porcentajeProfesor: Math.max(0, 100 - g)
                          });
                        }}
                      />
                    </div>
                  </div>

                  <button type="submit" className="btn btn-primary btn-full">
                    Guardar Tarifas y Cupo
                  </button>

                  {/* Google Authorized Accounts Section */}
                  <div
                    style={{
                      marginTop: '0.9rem',
                      paddingTop: '0.85rem',
                      borderTop: '1px solid #d5d4e2'
                    }}
                  >
                    <label className="field-label" style={{ marginBottom: '0.35rem' }}>
                      Accesos con Google (Correos Habilitados)
                    </label>
                    <p style={{ fontSize: '0.74rem', color: '#585666', marginBottom: '0.55rem' }}>
                      Agregá el correo de Google de quien quieras habilitar para que pueda iniciar
                      sesión con el botón de Google.
                    </p>

                    <div
                      style={{
                        display: 'flex',
                        gap: '0.45rem',
                        marginBottom: '0.6rem'
                      }}
                    >
                      <input
                        type="email"
                        className="input-control"
                        value={newAllowedEmail}
                        onChange={(e) => setNewAllowedEmail(e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        style={{ whiteSpace: 'nowrap' }}
                        onClick={handleAddAuthorizedEmail}
                      >
                        <Plus size={14} /> Habilitar Google
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      {(Array.isArray(gymConfig.emailsAutorizados)
                        ? gymConfig.emailsAutorizados
                        : [PRIMARY_ADMIN_EMAIL]
                      ).map((em) => {
                        const isMain = em.toLowerCase() === PRIMARY_ADMIN_EMAIL;
                        return (
                          <div
                            key={em}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '0.42rem 0.65rem',
                              borderRadius: 8,
                              background: '#f5f4f8',
                              border: '1px solid #d5d4e2',
                              fontSize: '0.8rem'
                            }}
                          >
                            <span className="mono" style={{ fontWeight: 700, color: '#1d4963' }}>
                              {em}
                            </span>
                            {isMain ? (
                              <span className="badge badge-emerald">Admin Principal</span>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-danger-soft btn-sm"
                                style={{ padding: '0.2rem 0.45rem', fontSize: '0.7rem' }}
                                onClick={() => handleRemoveAuthorizedEmail(em)}
                              >
                                Quitar
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </form>
              </div>
            )}

            {/* Collapsible 1: Carga Rápida del Mes (1-Toque) */}
            <div id="fast-charge-section" className="accordion-card">
              <button
                type="button"
                className="accordion-header emerald"
                onClick={() => toggleSection('dashFastCharge')}
              >
                <div className="accordion-title">
                  <Zap size={16} color="#fbbf24" />
                  <span>Carga Rápida {activeMonth} (1 Toque)</span>
                </div>
                <div className="accordion-right">
                  <span className="badge badge-amber">{mesData.pendientes.length} pendientes</span>
                  {openSections.dashFastCharge ? (
                    <ChevronDown size={18} />
                  ) : (
                    <ChevronRight size={18} />
                  )}
                </div>
              </button>

              {openSections.dashFastCharge && (
                <div className="accordion-body">
                  {mesData.activos.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '1rem 0.5rem' }}>
                      <p style={{ fontSize: '0.84rem', color: '#64748b', marginBottom: '0.65rem' }}>
                        Aún no hay alumnos cargados.
                      </p>
                      <button type="button" className="btn btn-primary" onClick={openNewAlumnoModal}>
                        <Plus size={15} /> Agregar Primer Alumno
                      </button>
                    </div>
                  ) : mesData.pendientes.length === 0 ? (
                    <div
                      style={{
                        textAlign: 'center',
                        padding: '0.9rem',
                        color: '#489cc8',
                        fontWeight: 700,
                        fontSize: '0.85rem'
                      }}
                    >
                      🎉 ¡Todos los alumnos activos ya tienen su cuota de {activeMonth} registrada!
                    </div>
                  ) : (
                    <>
                      {mesData.pendientes.length > 4 && (
                        <div style={{ marginBottom: '0.6rem' }}>
                          <input
                            type="text"
                            className="input-control"
                            placeholder="Filtrar pendiente por nombre..."
                            value={searchPendiente}
                            onChange={(e) => setSearchPendiente(e.target.value)}
                          />
                        </div>
                      )}
                      <div className="fast-charge-list">
                        {filteredPendientes.map((alu) => {
                          const cuota = getPrecioByDias(alu.diasPorSemana);
                          return (
                            <div key={alu.id} className="fast-charge-item">
                              <div className="fast-charge-info">
                                <div className="fast-charge-name">{alu.nombreCompleto}</div>
                                <div className="fast-charge-meta">
                                  <span className="badge badge-slate">{alu.diasPorSemana}d</span>
                                  <span>{alu.planEntrenamiento}</span>
                                  <strong className="mono" style={{ color: '#1d4963' }}>
                                    {formatCurrency(cuota)}
                                  </strong>
                                </div>
                              </div>
                              <div className="fast-charge-actions">
                                <button
                                  type="button"
                                  className="btn btn-emerald-soft btn-sm"
                                  disabled={busyId === alu.id}
                                  onClick={() => handleQuickCharge(alu, 'Efectivo')}
                                  title="Cobrar en Efectivo con 1 toque"
                                >
                                  <Banknote size={14} /> Efec.
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-blue-soft btn-sm"
                                  disabled={busyId === alu.id}
                                  onClick={() => handleQuickCharge(alu, 'Transferencia')}
                                  title="Cobrar por Transferencia con 1 toque"
                                >
                                  <Landmark size={14} /> Transf.
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Collapsible 2: Ocupación por Horario */}
            <div className="accordion-card">
              <button
                type="button"
                className="accordion-header"
                onClick={() => toggleSection('dashTurnos')}
              >
                <div className="accordion-title">
                  <CalendarClock size={16} color="#489cc8" />
                  <span>Ocupación por Franja Horaria</span>
                </div>
                <div className="accordion-right">
                  <span className="badge badge-slate">07:00 a 21:00</span>
                  {openSections.dashTurnos ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </div>
              </button>

              {openSections.dashTurnos && (
                <div className="accordion-body">
                  {statsExtras.porFranja.map((f) => (
                    <div key={f.hora} className="bar-row">
                      <div className="bar-row-header">
                        <span className="mono">{f.hora} hs</span>
                        <span className="mono">
                          {f.totalHora} / {f.capMaxFranja} ({f.pct}%)
                        </span>
                      </div>
                      <div className="bar-track">
                        <div
                          className={`bar-fill ${f.pct >= 75 ? 'amber' : ''}`}
                          style={{ width: `${Math.max(3, f.pct)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Collapsible 3: Alumnos por Plan */}
            <div className="accordion-card">
              <button
                type="button"
                className="accordion-header"
                onClick={() => toggleSection('dashPlanes')}
              >
                <div className="accordion-title">
                  <BarChart3 size={16} color="#489cc8" />
                  <span>Distribución por Plan</span>
                </div>
                <div className="accordion-right">
                  <span className="badge badge-emerald">{mesData.activos.length} socios</span>
                  {openSections.dashPlanes ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </div>
              </button>

              {openSections.dashPlanes && (
                <div className="accordion-body">
                  {statsExtras.porPlan.map((item) => (
                    <div key={item.plan} className="bar-row">
                      <div className="bar-row-header">
                        <span>{item.plan}</span>
                        <span className="mono">
                          {item.count} ({item.pct}%)
                        </span>
                      </div>
                      <div className="bar-track">
                        <div className="bar-fill" style={{ width: `${Math.max(4, item.pct)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== TAB 2: ALUMNOS ==================== */}
        {activeTab === 'Alumnos' && (
          <div>
            {/* Top Action & Search Bar */}
            <div
              style={{
                display: 'flex',
                gap: '0.5rem',
                marginBottom: '0.65rem',
                alignItems: 'center'
              }}
            >
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  type="text"
                  className="input-control"
                  placeholder="Buscar alumno..."
                  value={searchAlumno}
                  onChange={(e) => setSearchAlumno(e.target.value)}
                />
              </div>
              <button type="button" className="btn btn-emerald-soft" onClick={() => setShowShareModal(true)}>
                <Share2 size={15} /> Link WhatsApp
              </button>
              <button type="button" className="btn btn-primary" onClick={openNewAlumnoModal}>
                <Plus size={16} /> + Alumno
              </button>
            </div>

            {/* Quick Day Filter Pills */}
            <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.75rem' }}>
              {[
                { key: 'TODOS', label: `Todos (${alumnos.length})` },
                { key: '2', label: '2 Días' },
                { key: '3', label: '3 Días' },
                { key: '5', label: '5 Días' }
              ].map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={`month-pill ${filterDias === f.key ? 'active' : ''}`}
                  onClick={() => setFilterDias(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Collapsible Student Cards */}
            {filteredAlumnos.length === 0 ? (
              <div
                className="accordion-card"
                style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b' }}
              >
                <p style={{ marginBottom: '0.75rem', fontSize: '0.86rem' }}>
                  No hay alumnos registrados.
                </p>
                <button type="button" className="btn btn-primary" onClick={openNewAlumnoModal}>
                  <Plus size={16} /> Agregar Alumno
                </button>
              </div>
            ) : (
              <div className="item-list">
                {filteredAlumnos.map((alu) => {
                  const isOpen = expandedAlumnoId === alu.id;
                  const yaPagoMes = mesData.paidIds.has(alu.id);

                  return (
                    <div key={alu.id} className="item-card">
                      <button
                        type="button"
                        className="item-card-header"
                        onClick={() => setExpandedAlumnoId(isOpen ? null : alu.id)}
                      >
                        <div className="item-card-main">
                          <div className="item-card-title">
                            <span>{alu.nombreCompleto}</span>
                            <span className="badge badge-slate">{alu.diasPorSemana}d</span>
                            <span
                              className={`badge ${yaPagoMes ? 'badge-emerald' : 'badge-amber'}`}
                            >
                              {yaPagoMes ? `${activeMonth.slice(0, 3)} OK` : 'Pendiente'}
                            </span>
                          </div>
                          <div className="item-card-sub">
                            {alu.planEntrenamiento} • {alu.telefono}
                          </div>
                        </div>
                        {isOpen ? (
                          <ChevronDown size={18} color="#64748b" />
                        ) : (
                          <ChevronRight size={18} color="#64748b" />
                        )}
                      </button>

                      {isOpen && (
                        <div className="item-card-details">
                          <div className="schedule-chips">
                            {DIAS_SEMANA.map((d) =>
                              alu[d.key] ? (
                                <span key={d.key} className="schedule-chip">
                                  {d.short}: {alu[d.key]}
                                </span>
                              ) : null
                            )}
                          </div>

                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              color: '#475569',
                              fontSize: '0.75rem'
                            }}
                          >
                            <span>Edad: {alu.edad} años</span>
                            <span>Alta: {alu.fechaInscripcion}</span>
                          </div>

                          <div
                            style={{
                              display: 'flex',
                              gap: '0.4rem',
                              flexWrap: 'wrap',
                              marginTop: '0.2rem'
                            }}
                          >
                            {!yaPagoMes && (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-emerald-soft btn-sm"
                                  onClick={() => handleQuickCharge(alu, 'Efectivo')}
                                >
                                  <Banknote size={13} /> Cobrar Efec.
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-blue-soft btn-sm"
                                  onClick={() => handleQuickCharge(alu, 'Transferencia')}
                                >
                                  <Landmark size={13} /> Cobrar Transf.
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => openEditAlumnoModal(alu)}
                            >
                              <Edit3 size={13} /> Editar
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger-soft btn-sm"
                              onClick={() => handleDeleteAlumno(alu)}
                            >
                              <Trash2 size={13} /> Borrar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ==================== TAB 3: TURNOS Y CUPOS ==================== */}
        {activeTab === 'Turnos' && (
          <div>
            {/* Day Selector Tabs */}
            <div className="day-tabs">
              {DIAS_SEMANA.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  className={`day-tab ${selectedDia === d.key ? 'active' : ''}`}
                  onClick={() => setSelectedDia(d.key)}
                >
                  {d.short}
                </button>
              ))}
            </div>

            {/* Collapsible Time Slots for Selected Day */}
            <div className="item-list">
              {FRANJAS_HORARIAS.map((hora) => {
                const cell = turnosMatrix[hora][selectedDia];
                const isOpen = expandedHora === hora;
                let badgeClass = 'badge-emerald';
                if (cell.disponibles === 0) badgeClass = 'badge-red';
                else if (cell.disponibles <= 3) badgeClass = 'badge-amber';

                return (
                  <div key={hora} className="item-card">
                    <button
                      type="button"
                      className="item-card-header"
                      onClick={() => setExpandedHora(isOpen ? null : hora)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <span
                          className="mono"
                          style={{ fontWeight: 800, fontSize: '0.92rem', color: '#1d4963' }}
                        >
                          {hora} hs
                        </span>
                        <span className={`badge ${badgeClass}`}>
                          {cell.count} / {cupoMaximo} anotados
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#489cc8' }}>
                          {cell.disponibles} libres
                        </span>
                        {isOpen ? (
                          <ChevronDown size={17} color="#64748b" />
                        ) : (
                          <ChevronRight size={17} color="#64748b" />
                        )}
                      </div>
                    </button>

                    {isOpen && (
                      <div className="item-card-details">
                        {cell.inscriptos.length === 0 ? (
                          <span style={{ color: '#64748b' }}>Sin alumnos en este horario.</span>
                        ) : (
                          cell.inscriptos.map((alu) => (
                            <div
                              key={alu.id}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '0.35rem 0',
                                borderBottom: '1px solid #e2e8f0'
                              }}
                            >
                              <div>
                                <strong style={{ color: '#1d4963' }}>{alu.nombreCompleto}</strong>
                                <span style={{ color: '#64748b', marginLeft: 6 }}>
                                  ({alu.planEntrenamiento})
                                </span>
                              </div>
                              <span className="mono" style={{ fontSize: '0.74rem' }}>
                                {alu.telefono}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ==================== TAB 4: COBRANZAS ==================== */}
        {activeTab === 'Cobranzas' && (
          <div>
            {/* Compact Month Summary Strip */}
            <div className="kpi-grid-compact">
              <div className="kpi-box highlight">
                <div className="kpi-box-label">TOTAL {activeMonth.toUpperCase()}</div>
                <div className="kpi-box-val">{formatCurrency(mesData.totalRecaudado)}</div>
                <div className="kpi-box-sub">{mesData.pagosMes.length} pagos</div>
              </div>

              <div className="kpi-box">
                <div className="kpi-box-label">EFECTIVO / TRANSF.</div>
                <div className="kpi-box-val" style={{ fontSize: '0.95rem', color: '#489cc8' }}>
                  E: {formatCurrency(mesData.efectivo)}
                </div>
                <div className="kpi-box-sub">T: {formatCurrency(mesData.transferencia)}</div>
              </div>

              <div className="kpi-box">
                <div className="kpi-box-label">PROFESOR ({gymConfig.porcentajeProfesor}%)</div>
                <div className="kpi-box-val" style={{ color: '#d97706' }}>
                  {formatCurrency(mesData.liqProfesor)}
                </div>
                <div className="kpi-box-sub">Honorarios</div>
              </div>

              <div className="kpi-box">
                <div className="kpi-box-label">NETO GYM ({gymConfig.porcentajeGym}%)</div>
                <div className="kpi-box-val" style={{ color: '#1d4963' }}>
                  {formatCurrency(mesData.netoGym)}
                </div>
                <div className="kpi-box-sub">Utilidad gimnasio</div>
              </div>
            </div>

            {/* Collapsible 1: Cobro Rápido de Pendientes */}
            <div className="accordion-card">
              <button
                type="button"
                className="accordion-header emerald"
                onClick={() => toggleSection('cobFastCharge')}
              >
                <div className="accordion-title">
                  <Zap size={16} color="#fbbf24" />
                  <span>Pendientes de Pago ({activeMonth})</span>
                </div>
                <div className="accordion-right">
                  <span className="badge badge-amber">{mesData.pendientes.length} socios</span>
                  {openSections.cobFastCharge ? (
                    <ChevronDown size={18} />
                  ) : (
                    <ChevronRight size={18} />
                  )}
                </div>
              </button>

              {openSections.cobFastCharge && (
                <div className="accordion-body">
                  {mesData.pendientes.length === 0 ? (
                    <div
                      style={{
                        textAlign: 'center',
                        padding: '0.6rem',
                        color: '#489cc8',
                        fontWeight: 700,
                        fontSize: '0.84rem'
                      }}
                    >
                      ✅ Todos los socios activos pagaron {activeMonth}.
                    </div>
                  ) : (
                    <div className="fast-charge-list">
                      {mesData.pendientes.map((alu) => {
                        const cuota = getPrecioByDias(alu.diasPorSemana);
                        return (
                          <div key={alu.id} className="fast-charge-item">
                            <div className="fast-charge-info">
                              <div className="fast-charge-name">{alu.nombreCompleto}</div>
                              <div className="fast-charge-meta">
                                <span className="badge badge-slate">{alu.diasPorSemana}d</span>
                                <span>{alu.planEntrenamiento}</span>
                                <strong className="mono" style={{ color: '#1d4963' }}>
                                  {formatCurrency(cuota)}
                                </strong>
                              </div>
                            </div>
                            <div className="fast-charge-actions">
                              <button
                                type="button"
                                className="btn btn-emerald-soft btn-sm"
                                disabled={busyId === alu.id}
                                onClick={() => handleQuickCharge(alu, 'Efectivo')}
                              >
                                <Banknote size={14} /> Efec.
                              </button>
                              <button
                                type="button"
                                className="btn btn-blue-soft btn-sm"
                                disabled={busyId === alu.id}
                                onClick={() => handleQuickCharge(alu, 'Transferencia')}
                              >
                                <Landmark size={14} /> Transf.
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Collapsible 2: Carga con Descuento / Manual */}
            <div className="accordion-card">
              <button
                type="button"
                className="accordion-header"
                onClick={() => toggleSection('cobManualForm')}
              >
                <div className="accordion-title">
                  <Plus size={16} color="#489cc8" />
                  <span>Cobro Manual / Con Descuento</span>
                </div>
                {openSections.cobManualForm ? (
                  <ChevronDown size={18} />
                ) : (
                  <ChevronRight size={18} />
                )}
              </button>

              {openSections.cobManualForm && (
                <form className="accordion-body" onSubmit={handleSaveManualCobranza}>
                  <div className="form-group">
                    <label>Alumno *</label>
                    <select
                      required
                      className="select-control"
                      value={cobranzaForm.alumnoId}
                      onChange={(e) => handleSelectAlumnoForCobranza(e.target.value)}
                    >
                      <option value="">— Seleccionar socio —</option>
                      {alumnos.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.nombreCompleto} ({a.diasPorSemana}d • {a.planEntrenamiento})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-grid-2" style={{ marginBottom: '0.65rem' }}>
                    <div>
                      <label className="field-label">Precio Cuota ($)</label>
                      <input
                        type="number"
                        required
                        className="input-control mono"
                        value={cobranzaForm.precioCuota}
                        onChange={(e) =>
                          setCobranzaForm({ ...cobranzaForm, precioCuota: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="field-label">Desc. (-) / Recargo (+)</label>
                      <input
                        type="number"
                        className="input-control mono"
                        value={cobranzaForm.descuentoInscripcion}
                        onChange={(e) =>
                          setCobranzaForm({
                            ...cobranzaForm,
                            descuentoInscripcion: e.target.value
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="form-grid-2" style={{ marginBottom: '0.65rem' }}>
                    <div>
                      <label className="field-label">Método de Pago</label>
                      <select
                        className="select-control"
                        value={cobranzaForm.metodoPago}
                        onChange={(e) =>
                          setCobranzaForm({ ...cobranzaForm, metodoPago: e.target.value })
                        }
                      >
                        <option value="Efectivo">Efectivo</option>
                        <option value="Transferencia">Transferencia</option>
                      </select>
                    </div>
                    <div>
                      <label className="field-label">Fecha</label>
                      <input
                        type="date"
                        required
                        className="input-control mono"
                        value={cobranzaForm.fechaPago}
                        onChange={(e) =>
                          setCobranzaForm({ ...cobranzaForm, fechaPago: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Nota / Observación</label>
                    <input
                      type="text"
                      className="input-control"
                      placeholder="Opcional..."
                      value={cobranzaForm.observaciones}
                      onChange={(e) =>
                        setCobranzaForm({ ...cobranzaForm, observaciones: e.target.value })
                      }
                    />
                  </div>

                  <button type="submit" className="btn btn-primary btn-full">
                    Registrar Pago ({formatCurrency(
                      Math.max(
                        0,
                        (Number(cobranzaForm.precioCuota) || 0) +
                          (Number(cobranzaForm.descuentoInscripcion) || 0)
                      )
                    )})
                  </button>
                </form>
              )}
            </div>

            {/* Collapsible 3: Historial de Pagos del Mes */}
            <div className="accordion-card">
              <button
                type="button"
                className="accordion-header"
                onClick={() => toggleSection('cobHistory')}
              >
                <div className="accordion-title">
                  <DollarSign size={16} color="#489cc8" />
                  <span>Pagos Registrados en {activeMonth}</span>
                </div>
                <div className="accordion-right">
                  <span className="badge badge-emerald">{mesData.pagosMes.length} pagos</span>
                  {openSections.cobHistory ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </div>
              </button>

              {openSections.cobHistory && (
                <div className="accordion-body">
                  {mesData.pagosMes.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#64748b', fontSize: '0.84rem' }}>
                      No hay pagos cargados en {activeMonth}.
                    </p>
                  ) : (
                    <div className="fast-charge-list">
                      {mesData.pagosMes.map((cob) => (
                        <div key={cob.id} className="fast-charge-item">
                          <div className="fast-charge-info">
                            <div className="fast-charge-name">{cob.alumnoNombre}</div>
                            <div className="fast-charge-meta">
                              <span
                                className={`badge ${
                                  cob.metodoPago === 'Efectivo' ? 'badge-emerald' : 'badge-blue'
                                }`}
                              >
                                {cob.metodoPago}
                              </span>
                              <span>{cob.actividad}</span>
                              <span className="mono">{cob.fechaPago}</span>
                            </div>
                          </div>
                          <div className="fast-charge-actions">
                            <strong className="mono" style={{ color: '#1d4963', fontSize: '0.9rem' }}>
                              {formatCurrency(cob.totalPagado)}
                            </strong>
                            <button
                              type="button"
                              className="btn btn-danger-soft btn-sm"
                              onClick={() => handleDeleteCobranza(cob)}
                              title="Eliminar pago"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ==================== MODAL 1: AGREGAR / EDITAR ALUMNO ==================== */}
      {showAlumnoModal && (
        <div className="modal-backdrop" onClick={() => setShowAlumnoModal(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <UserPlus size={17} />
                <span>{editingAlumnoId ? 'Editar Alumno' : 'Nuevo Alumno'}</span>
              </h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowAlumnoModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            <form className="modal-body" onSubmit={handleSaveAlumno}>
              <div className="form-group">
                <label>Nombre y Apellido *</label>
                <input
                  type="text"
                  required
                  className="input-control"
                  value={alumnoForm.nombreCompleto}
                  onChange={(e) =>
                    setAlumnoForm({ ...alumnoForm, nombreCompleto: e.target.value })
                  }
                />
              </div>

              <div className="form-grid-2" style={{ marginBottom: '0.75rem' }}>
                <div>
                  <label className="field-label">Teléfono *</label>
                  <input
                    type="text"
                    required
                    className="input-control"
                    value={alumnoForm.telefono}
                    onChange={(e) => setAlumnoForm({ ...alumnoForm, telefono: e.target.value })}
                  />
                </div>
                <div>
                  <label className="field-label">Edad *</label>
                  <input
                    type="number"
                    min={5}
                    max={110}
                    required
                    className="input-control mono"
                    value={alumnoForm.edad}
                    onChange={(e) => setAlumnoForm({ ...alumnoForm, edad: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-grid-2" style={{ marginBottom: '0.75rem' }}>
                <div>
                  <label className="field-label">Días por Semana</label>
                  <select
                    className="select-control"
                    value={alumnoForm.diasPorSemana}
                    onChange={(e) =>
                      setAlumnoForm({ ...alumnoForm, diasPorSemana: Number(e.target.value) })
                    }
                  >
                    <option value={2}>2 días ({formatCurrency(gymConfig.tarifa2Dias)})</option>
                    <option value={3}>3 días ({formatCurrency(gymConfig.tarifa3Dias)})</option>
                    <option value={5}>5 días ({formatCurrency(gymConfig.tarifa5Dias)})</option>
                  </select>
                </div>
                <div>
                  <label className="field-label">Plan / Actividad</label>
                  <select
                    className="select-control"
                    value={alumnoForm.planEntrenamiento}
                    onChange={(e) =>
                      setAlumnoForm({ ...alumnoForm, planEntrenamiento: e.target.value })
                    }
                  >
                    {PLANES_ENTRENAMIENTO.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="field-label" style={{ marginBottom: '0.4rem' }}>
                Horarios por Día
              </label>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '0.5rem',
                  marginBottom: '0.85rem',
                  background: '#f8fafc',
                  padding: '0.65rem',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0'
                }}
              >
                {DIAS_SEMANA.map((d) => (
                  <div key={d.key}>
                    <label className="field-label" style={{ color: '#2c6d91' }}>
                      {d.label}
                    </label>
                    <select
                      className="select-control mono"
                      style={{ padding: '0.42rem 0.5rem', fontSize: '0.82rem' }}
                      value={alumnoForm[d.key]}
                      onChange={(e) => setAlumnoForm({ ...alumnoForm, [d.key]: e.target.value })}
                    >
                      <option value="">— Libre —</option>
                      {FRANJAS_HORARIAS.map((h) => (
                        <option key={h} value={h}>
                          {h} hs
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="form-grid-2" style={{ marginBottom: '0.9rem' }}>
                <div>
                  <label className="field-label">Correo (opcional)</label>
                  <input
                    type="email"
                    className="input-control"
                    value={alumnoForm.correo}
                    onChange={(e) => setAlumnoForm({ ...alumnoForm, correo: e.target.value })}
                  />
                </div>
                <div>
                  <label className="field-label">Fecha Alta</label>
                  <input
                    type="date"
                    required
                    className="input-control mono"
                    value={alumnoForm.fechaInscripcion}
                    onChange={(e) =>
                      setAlumnoForm({ ...alumnoForm, fechaInscripcion: e.target.value })
                    }
                  />
                </div>
              </div>

              <button type="submit" className="btn btn-primary btn-full">
                {editingAlumnoId ? 'Guardar Cambios' : 'Registrar Alumno'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL 2: EXPORTAR PDF PERSONALIZADO ==================== */}
      {showPdfModal && (
        <div className="modal-backdrop" onClick={() => setShowPdfModal(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <FileText size={17} />
                <span>Exportar Reporte en PDF</span>
              </h3>
              <button type="button" className="modal-close" onClick={() => setShowPdfModal(false)}>
                <X size={16} />
              </button>
            </div>

            <form className="modal-body" onSubmit={handleGeneratePDF}>
              <div className="form-grid-2" style={{ marginBottom: '0.85rem' }}>
                <div>
                  <label className="field-label">Mes a Exportar</label>
                  <select
                    className="select-control"
                    value={pdfOptions.mes}
                    onChange={(e) => setPdfOptions({ ...pdfOptions, mes: e.target.value })}
                  >
                    {MESES_COBRANZA.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="field-label">Filtrar Pagos por Método</label>
                  <select
                    className="select-control"
                    value={pdfOptions.metodoFiltro}
                    onChange={(e) =>
                      setPdfOptions({ ...pdfOptions, metodoFiltro: e.target.value })
                    }
                  >
                    <option value="TODOS">Efectivo + Transferencia</option>
                    <option value="Efectivo">Solo Efectivo</option>
                    <option value="Transferencia">Solo Transferencia</option>
                  </select>
                </div>
              </div>

              <label className="field-label" style={{ marginBottom: '0.45rem' }}>
                Selecciona qué datos incluir en el PDF:
              </label>

              <label className="checkbox-item">
                <input
                  type="checkbox"
                  checked={pdfOptions.incluirResumenFinanciero}
                  onChange={(e) =>
                    setPdfOptions({
                      ...pdfOptions,
                      incluirResumenFinanciero: e.target.checked
                    })
                  }
                />
                <span>Resumen Financiero del Mes (Totales, Profesor y Neto Gym)</span>
              </label>

              <label className="checkbox-item">
                <input
                  type="checkbox"
                  checked={pdfOptions.incluirPagosDelMes}
                  onChange={(e) =>
                    setPdfOptions({ ...pdfOptions, incluirPagosDelMes: e.target.checked })
                  }
                />
                <span>Detalle de Cobranzas / Pagos del Mes</span>
              </label>

              <label className="checkbox-item">
                <input
                  type="checkbox"
                  checked={pdfOptions.incluirPendientesDePago}
                  onChange={(e) =>
                    setPdfOptions({
                      ...pdfOptions,
                      incluirPendientesDePago: e.target.checked
                    })
                  }
                />
                <span>Alumnos Pendientes de Pago en el Mes</span>
              </label>

              <label className="checkbox-item">
                <input
                  type="checkbox"
                  checked={pdfOptions.incluirPadronAlumnos}
                  onChange={(e) =>
                    setPdfOptions({ ...pdfOptions, incluirPadronAlumnos: e.target.checked })
                  }
                />
                <span>Padrón Completo de Alumnos y Horarios</span>
              </label>

              <label className="checkbox-item">
                <input
                  type="checkbox"
                  checked={pdfOptions.incluirOcupacionTurnos}
                  onChange={(e) =>
                    setPdfOptions({
                      ...pdfOptions,
                      incluirOcupacionTurnos: e.target.checked
                    })
                  }
                />
                <span>Grilla de Turnos y Cupos Disponibles</span>
              </label>

              <button
                type="submit"
                className="btn btn-primary btn-full"
                style={{ marginTop: '0.6rem' }}
              >
                <FileText size={16} /> Descargar PDF ({pdfOptions.mes})
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL 3: COMPARTIR LINK DE INSCRIPCIÓN POR WHATSAPP ==================== */}
      {showShareModal && (
        <div className="modal-backdrop" onClick={() => setShowShareModal(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <Share2 size={17} />
                <span>Link de Autoinscripción (WhatsApp)</span>
              </h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowShareModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="modal-body">
              <p style={{ fontSize: '0.82rem', color: '#475569', marginBottom: '0.75rem' }}>
                Envía este enlace a tus alumnos para que completen sus datos y horarios desde su
                celular. Se cargarán automáticamente en tu lista de <strong>Alumnos</strong> y{' '}
                <strong>Turnos</strong>.
              </p>

              <div className="form-group">
                <label>Enlace Único de Inscripción</label>
                <input
                  type="text"
                  readOnly
                  className="input-control mono"
                  style={{ fontSize: '0.76rem', background: '#f8fafc' }}
                  value={getSelfRegisterUrl()}
                  onClick={(e) => e.target.select()}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-primary btn-full"
                  onClick={handleSendWhatsAppLink}
                >
                  <Share2 size={16} /> Enviar por WhatsApp
                </button>

                <button
                  type="button"
                  className="btn btn-emerald-soft btn-full"
                  onClick={handleCopyInscripcionLink}
                >
                  <Copy size={16} /> Copiar Link
                </button>

                <button
                  type="button"
                  className="btn btn-secondary btn-full"
                  onClick={() => {
                    setShowShareModal(false);
                    setInscripcionGymName(gymConfig.nombre || 'AboroGym');
                    setInscripcionGymUid(user.uid);
                  }}
                >
                  Ver cómo lo ve el Alumno
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== STICKY BOTTOM NAVIGATION ==================== */}
      <nav className="bottom-nav">
        <button
          type="button"
          className={`bottom-nav-btn ${activeTab === 'Dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('Dashboard')}
        >
          <div className="bottom-nav-icon-wrap">
            <BarChart3 size={20} />
          </div>
          <span>Inicio</span>
        </button>

        <button
          type="button"
          className={`bottom-nav-btn ${activeTab === 'Alumnos' ? 'active' : ''}`}
          onClick={() => setActiveTab('Alumnos')}
        >
          <div className="bottom-nav-icon-wrap">
            <Users size={20} />
            {alumnos.length > 0 && <span className="nav-count-badge">{alumnos.length}</span>}
          </div>
          <span>Alumnos</span>
        </button>

        <button
          type="button"
          className={`bottom-nav-btn ${activeTab === 'Turnos' ? 'active' : ''}`}
          onClick={() => setActiveTab('Turnos')}
        >
          <div className="bottom-nav-icon-wrap">
            <CalendarClock size={20} />
          </div>
          <span>Turnos</span>
        </button>

        <button
          type="button"
          className={`bottom-nav-btn ${activeTab === 'Cobranzas' ? 'active' : ''}`}
          onClick={() => setActiveTab('Cobranzas')}
        >
          <div className="bottom-nav-icon-wrap">
            <DollarSign size={20} />
            {mesData.pagosMes.length > 0 && (
              <span className="nav-count-badge">{mesData.pagosMes.length}</span>
            )}
          </div>
          <span>Cobranzas</span>
        </button>
      </nav>
    </div>
  );
}
