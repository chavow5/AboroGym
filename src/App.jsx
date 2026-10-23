import React, { useState, useEffect, useMemo } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
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
import {
  Dumbbell,
  Users,
  CalendarClock,
  DollarSign,
  BarChart3,
  Plus,
  Trash2,
  Edit3,
  Download,
  RefreshCw,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Search,
  Sparkles,
  ShieldCheck,
  TrendingUp,
  Wallet,
  Clock,
  Building2,
  Crown,
  Eye,
  ArrowRight
} from 'lucide-react';
import { auth, googleProvider, db } from './firebase';
import {
  SUPER_ADMIN_EMAIL,
  FRANJAS_HORARIAS,
  DIAS_SEMANA,
  PLANES_ENTRENAMIENTO,
  MESES_COBRANZA,
  INITIAL_TENANTS,
  INITIAL_ALUMNOS_BY_TENANT,
  INITIAL_COBRANZAS_BY_TENANT
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
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  // ==================== MULTI-TENANT STATE ====================
  const [tenantsMap, setTenantsMap] = useState(() => {
    const map = {};
    INITIAL_TENANTS.forEach((t) => {
      map[t.tenantId] = t;
    });
    return map;
  });
  const [alumnosByTenant, setAlumnosByTenant] = useState({
    'gym-1': [],
    'gym-2': [],
    'gym-3': []
  });
  const [cobranzasByTenant, setCobranzasByTenant] = useState({
    'gym-1': [],
    'gym-2': [],
    'gym-3': []
  });
  const [tenantsLoaded, setTenantsLoaded] = useState(false);

  // Active Tenant ('gym-1' | 'gym-2' | 'gym-3')
  const [activeTenantId, setActiveTenantId] = useState('gym-1');
  // Super Admin can simulate client view ('ADMIN' | 'gym-1' | 'gym-2' | 'gym-3')
  const [simulatedRole, setSimulatedRole] = useState('ADMIN');

  // ==================== WORKBOOK NAVIGATION ====================
  // 'AdminGlobal' | 'Alumnos' | 'Turnos' | 'Octubre' | 'Noviembre' | 'Diciembre' | 'Dashboard'
  const [activeSheet, setActiveSheet] = useState('AdminGlobal');

  const [seeding, setSeeding] = useState(false);
  const [statusBanner, setStatusBanner] = useState('');

  // ==================== SHEET 1: ALUMNOS FORM & FILTERS ====================
  const [searchAlumno, setSearchAlumno] = useState('');
  const [filterPlan, setFilterPlan] = useState('TODOS');
  const [filterDias, setFilterDias] = useState('TODOS');
  const [editingAlumnoId, setEditingAlumnoId] = useState(null);
  const [alumnoForm, setAlumnoForm] = useState({
    nombreCompleto: '',
    telefono: '',
    edad: 25,
    diasPorSemana: 3,
    planEntrenamiento: 'Funcional',
    lunes: '18:00',
    martes: '',
    miercoles: '18:00',
    jueves: '',
    viernes: '18:00',
    correo: '',
    fechaInscripcion: new Date().toISOString().slice(0, 10),
    activo: true
  });

  // ==================== SHEET 2: TURNOS Y CUPOS STATE ====================
  const [selectedDia, setSelectedDia] = useState('lunes');
  const [selectedHorario, setSelectedHorario] = useState('19:00');
  const [cupoInput, setCupoInput] = useState(12);

  // ==================== SHEET 3-5: COBRANZAS FORM & CONFIG ====================
  const [cobranzaForm, setCobranzaForm] = useState({
    alumnoId: '',
    dias: 3,
    precioCuota: 35000,
    actividad: 'Funcional',
    metodoPago: 'Transferencia',
    descuentoInscripcion: 0,
    observaciones: '',
    fechaPago: new Date().toISOString().slice(0, 10)
  });

  const [tarifasForm, setTarifasForm] = useState(INITIAL_TENANTS[0]);

  // ==================== ADMIN GLOBAL SEARCH & CLIENT EDIT ====================
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [editingTenantId, setEditingTenantId] = useState(null);
  const [tenantEditForm, setTenantEditForm] = useState({
    nombre: '',
    sede: '',
    clientNombre: '',
    clientEmail: '',
    planSaaS: 'Pro'
  });

  // ==================== AUTH LISTENER ====================
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // Determine real role of logged-in user
  const userAccessInfo = useMemo(() => {
    if (!user) return { isRealSuperAdmin: false, assignedTenantId: null };
    const emailLower = (user.email || '').toLowerCase();

    // Check if user's email matches a specific client email in tenantsMap
    const matchedTenant = Object.values(tenantsMap).find(
      (t) => (t.clientEmail || '').toLowerCase() === emailLower && emailLower !== SUPER_ADMIN_EMAIL
    );

    if (matchedTenant) {
      return {
        isRealSuperAdmin: false,
        assignedTenantId: matchedTenant.tenantId
      };
    }

    // Otherwise, Super Admin (davidrmrz10@gmail.com or workspace creator)
    return {
      isRealSuperAdmin: true,
      assignedTenantId: null
    };
  }, [user, tenantsMap]);

  // Effective role (accounting for Super Admin role simulator)
  const isEffectiveAdmin = userAccessInfo.isRealSuperAdmin && simulatedRole === 'ADMIN';
  const lockedTenantId = !userAccessInfo.isRealSuperAdmin
    ? userAccessInfo.assignedTenantId
    : simulatedRole !== 'ADMIN'
    ? simulatedRole
    : null;

  // Keep activeTenantId and activeSheet in sync with role
  useEffect(() => {
    if (lockedTenantId) {
      setActiveTenantId(lockedTenantId);
      if (activeSheet === 'AdminGlobal') {
        setActiveSheet('Alumnos');
      }
    }
  }, [lockedTenantId, activeSheet]);

  // Current active tenant data
  const currentTenant = tenantsMap[activeTenantId] || INITIAL_TENANTS[0];
  const alumnos = alumnosByTenant[activeTenantId] || [];
  const cobranzas = cobranzasByTenant[activeTenantId] || [];

  useEffect(() => {
    setTarifasForm(currentTenant);
    setCupoInput(currentTenant.cupoMaximoDefault || 12);
    setCobranzaForm((prev) => ({
      ...prev,
      precioCuota: currentTenant.tarifa3Dias || 35000
    }));
  }, [activeTenantId, tenantsMap]);

  // ==================== FIRESTORE MULTI-TENANT LISTENERS ====================
  useEffect(() => {
    if (!user) return;

    const tenantIdsToWatch = userAccessInfo.isRealSuperAdmin
      ? ['gym-1', 'gym-2', 'gym-3']
      : [userAccessInfo.assignedTenantId || 'gym-1'];

    const unsubs = [];
    let loadedCount = 0;

    tenantIdsToWatch.forEach((tId) => {
      // 1. Tenant metadata & config document
      const unsubTenant = onSnapshot(
        doc(db, 'tenants', tId),
        (snap) => {
          if (snap.exists()) {
            setTenantsMap((prev) => ({
              ...prev,
              [tId]: snap.data()
            }));
          }
          loadedCount += 1;
          if (loadedCount >= tenantIdsToWatch.length) {
            setTenantsLoaded(true);
          }
        },
        (err) => {
          console.warn(`Aviso lectura tenant ${tId}:`, err.message);
          setTenantsLoaded(true);
        }
      );

      // 2. Tenant Alumnos subcollection
      const unsubAlumnos = onSnapshot(
        collection(db, 'tenants', tId, 'alumnos'),
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          list.sort((a, b) => (a.nombreCompleto || '').localeCompare(b.nombreCompleto || ''));
          setAlumnosByTenant((prev) => ({
            ...prev,
            [tId]: list
          }));
        },
        (err) => {
          console.warn(`Aviso lectura alumnos ${tId}:`, err.message);
        }
      );

      // 3. Tenant Cobranzas subcollection
      const unsubCobranzas = onSnapshot(
        collection(db, 'tenants', tId, 'cobranzas'),
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          list.sort((a, b) => (b.fechaPago || '').localeCompare(a.fechaPago || ''));
          setCobranzasByTenant((prev) => ({
            ...prev,
            [tId]: list
          }));
        },
        (err) => {
          console.warn(`Aviso lectura cobranzas ${tId}:`, err.message);
        }
      );

      unsubs.push(unsubTenant, unsubAlumnos, unsubCobranzas);
    });

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [user, userAccessInfo.isRealSuperAdmin, userAccessInfo.assignedTenantId]);

  // Auto-seed all 3 tenants on first Super Admin login if empty
  useEffect(() => {
    const totalAlumnosAcrossAll =
      (alumnosByTenant['gym-1']?.length || 0) +
      (alumnosByTenant['gym-2']?.length || 0) +
      (alumnosByTenant['gym-3']?.length || 0);

    if (
      user &&
      userAccessInfo.isRealSuperAdmin &&
      tenantsLoaded &&
      totalAlumnosAcrossAll === 0 &&
      !seeding
    ) {
      const seedKey = `aborogym_multitenant_seeded_${user.uid}`;
      if (!localStorage.getItem(seedKey)) {
        localStorage.setItem(seedKey, 'true');
        handleSeedMultiTenant(false);
      }
    }
  }, [user, userAccessInfo.isRealSuperAdmin, tenantsLoaded, alumnosByTenant]);

  const showTempBanner = (msg) => {
    setStatusBanner(msg);
    setTimeout(() => setStatusBanner(''), 4200);
  };

  // ==================== SEED / RESTORE ALL 3 GYMS ====================
  const handleSeedMultiTenant = async (confirmFirst = true) => {
    if (!user) return;
    if (
      confirmFirst &&
      !window.confirm(
        '¿Deseas inicializar/restaurar los datos de demostración de los 3 Gimnasios (AboroGym Central, Titanium Norte y Sparta Sur) en Cloud Firestore?'
      )
    ) {
      return;
    }

    setSeeding(true);
    try {
      const nowIso = new Date().toISOString();

      for (const tenantCfg of INITIAL_TENANTS) {
        const tId = tenantCfg.tenantId;
        await setDoc(doc(db, 'tenants', tId), {
          ...tenantCfg,
          adminUid: user.uid,
          updatedAt: nowIso
        });

        const initialAlumnos = INITIAL_ALUMNOS_BY_TENANT[tId] || [];
        for (const alu of initialAlumnos) {
          const { id, ...rest } = alu;
          await setDoc(doc(db, 'tenants', tId, 'alumnos', id), {
            ...rest,
            tenantId: tId,
            createdAt: nowIso
          });
        }

        const initialCobranzas = INITIAL_COBRANZAS_BY_TENANT[tId] || [];
        for (const cob of initialCobranzas) {
          const { id, ...rest } = cob;
          await setDoc(doc(db, 'tenants', tId, 'cobranzas', id), {
            ...rest,
            tenantId: tId,
            createdAt: nowIso
          });
        }
      }

      showTempBanner('Red Multi-Tenant (3 Gimnasios) sincronizada en Cloud Firestore.');
    } catch (err) {
      console.error('Error seeding multi-tenant:', err);
      alert('Error al inicializar los 3 gimnasios: ' + err.message);
    } finally {
      setSeeding(false);
    }
  };

  // ==================== AUTH HANDLERS ====================
  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthBusy(true);
    try {
      if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (err) {
      let msg = err.message;
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        msg = 'Credenciales inválidas. Verifica tu correo y contraseña o regístrate.';
      } else if (err.code === 'auth/email-already-in-use') {
        msg = 'Este correo ya está registrado. Cambia a "Iniciar Sesión".';
      } else if (err.code === 'auth/weak-password') {
        msg = 'La contraseña debe tener al menos 6 caracteres.';
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
      let msg = err.message;
      if (err.code === 'auth/unauthorized-domain') {
        msg =
          'Dominio no autorizado para Google Sign-In. Verifica que "localhost" esté en Authentication > Settings > Authorized domains.';
      } else if (err.code === 'auth/popup-closed-by-user') {
        msg = 'Inicio de sesión con Google cancelado.';
      }
      setAuthError(msg);
    } finally {
      setAuthBusy(false);
    }
  };

  // ==================== SUPER ADMIN: UPDATE TENANT CLIENT INFO ====================
  const handleStartEditTenant = (t) => {
    setEditingTenantId(t.tenantId);
    setTenantEditForm({
      nombre: t.nombre,
      sede: t.sede,
      clientNombre: t.clientNombre,
      clientEmail: t.clientEmail,
      planSaaS: t.planSaaS
    });
  };

  const handleSaveTenantClientInfo = async (e) => {
    e.preventDefault();
    if (!user || !editingTenantId) return;
    const existing = tenantsMap[editingTenantId];
    if (!existing) return;

    try {
      await setDoc(doc(db, 'tenants', editingTenantId), {
        ...existing,
        adminUid: existing.adminUid || user.uid,
        nombre: tenantEditForm.nombre.trim(),
        sede: tenantEditForm.sede.trim(),
        clientNombre: tenantEditForm.clientNombre.trim(),
        clientEmail: tenantEditForm.clientEmail.trim().toLowerCase(),
        planSaaS: tenantEditForm.planSaaS,
        updatedAt: new Date().toISOString()
      });
      setEditingTenantId(null);
      showTempBanner(`Datos del cliente actualizados para ${tenantEditForm.nombre}.`);
    } catch (err) {
      alert('Error al actualizar cliente: ' + err.message);
    }
  };

  // ==================== SHEET 1: ALUMNOS CRUD (SCOPED TO ACTIVE TENANT) ====================
  const resetAlumnoForm = () => {
    setEditingAlumnoId(null);
    setAlumnoForm({
      nombreCompleto: '',
      telefono: '',
      edad: 25,
      diasPorSemana: 3,
      planEntrenamiento: 'Funcional',
      lunes: '18:00',
      martes: '',
      miercoles: '18:00',
      jueves: '',
      viernes: '18:00',
      correo: '',
      fechaInscripcion: new Date().toISOString().slice(0, 10),
      activo: true
    });
  };

  const handleSaveAlumno = async (e) => {
    e.preventDefault();
    if (!user) return;

    const payload = {
      tenantId: activeTenantId,
      nombreCompleto: alumnoForm.nombreCompleto.trim(),
      telefono: alumnoForm.telefono.trim(),
      edad: Number(alumnoForm.edad) || 18,
      diasPorSemana: Number(alumnoForm.diasPorSemana),
      planEntrenamiento: alumnoForm.planEntrenamiento,
      lunes: alumnoForm.lunes || '',
      martes: alumnoForm.martes || '',
      miercoles: alumnoForm.miercoles || '',
      jueves: alumnoForm.jueves || '',
      viernes: alumnoForm.viernes || '',
      correo: alumnoForm.correo.trim(),
      fechaInscripcion: alumnoForm.fechaInscripcion,
      activo: Boolean(alumnoForm.activo)
    };

    try {
      if (editingAlumnoId) {
        const existing = alumnos.find((a) => a.id === editingAlumnoId);
        await updateDoc(doc(db, 'tenants', activeTenantId, 'alumnos', editingAlumnoId), {
          ...payload,
          createdAt: existing?.createdAt || new Date().toISOString()
        });
        showTempBanner(`Socio "${payload.nombreCompleto}" actualizado en ${currentTenant.nombre}.`);
      } else {
        await addDoc(collection(db, 'tenants', activeTenantId, 'alumnos'), {
          ...payload,
          createdAt: new Date().toISOString()
        });
        showTempBanner(`Socio "${payload.nombreCompleto}" registrado en ${currentTenant.nombre}.`);
      }
      resetAlumnoForm();
    } catch (err) {
      alert('Error al guardar socio: ' + err.message);
    }
  };

  const handleEditAlumno = (alu) => {
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
      correo: alu.correo,
      fechaInscripcion: alu.fechaInscripcion,
      activo: alu.activo ?? true
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteAlumno = async (alu) => {
    if (!user) return;
    if (
      !window.confirm(`¿Eliminar a "${alu.nombreCompleto}" de la sede ${currentTenant.nombre}?`)
    ) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'tenants', activeTenantId, 'alumnos', alu.id));
      showTempBanner(`Socio "${alu.nombreCompleto}" eliminado.`);
    } catch (err) {
      alert('Error al eliminar socio: ' + err.message);
    }
  };

  // ==================== SHEET 3-5: COBRANZAS & TARIFAS CRUD ====================
  const getPrecioByDias = (diasNum, cfg = currentTenant) => {
    if (Number(diasNum) === 2) return Number(cfg.tarifa2Dias) || 28000;
    if (Number(diasNum) === 5) return Number(cfg.tarifa5Dias) || 45000;
    return Number(cfg.tarifa3Dias) || 35000;
  };

  const handleSelectAlumnoForCobranza = (alumnoId) => {
    const found = alumnos.find((a) => a.id === alumnoId);
    if (!found) {
      setCobranzaForm((prev) => ({ ...prev, alumnoId: '' }));
      return;
    }
    const precio = getPrecioByDias(found.diasPorSemana);
    setCobranzaForm((prev) => ({
      ...prev,
      alumnoId: found.id,
      dias: found.diasPorSemana,
      precioCuota: precio,
      actividad: found.planEntrenamiento
    }));
  };

  const handleSaveCobranza = async (e, mesActual) => {
    e.preventDefault();
    if (!user) return;
    const foundAlumno = alumnos.find((a) => a.id === cobranzaForm.alumnoId);
    if (!foundAlumno) {
      alert('Por favor selecciona un Alumno de la lista.');
      return;
    }

    const precioBase = Number(cobranzaForm.precioCuota) || 0;
    const ajuste = Number(cobranzaForm.descuentoInscripcion) || 0;
    const totalPagado = Math.max(0, precioBase + ajuste);

    try {
      await addDoc(collection(db, 'tenants', activeTenantId, 'cobranzas'), {
        tenantId: activeTenantId,
        mes: mesActual,
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
      showTempBanner(
        `Cobranza registrada en "${mesActual}" (${currentTenant.nombre}) para ${foundAlumno.nombreCompleto}.`
      );
    } catch (err) {
      alert('Error al guardar cobranza: ' + err.message);
    }
  };

  const handleDeleteCobranza = async (cob) => {
    if (!user) return;
    if (!window.confirm(`¿Eliminar el registro de pago de ${cob.alumnoNombre} (${cob.mes})?`)) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'tenants', activeTenantId, 'cobranzas', cob.id));
      showTempBanner('Registro de pago eliminado.');
    } catch (err) {
      alert('Error al eliminar pago: ' + err.message);
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    if (!user) return;
    const profPct = Number(tarifasForm.porcentajeProfesor) || 67;
    const gymPct = Number(tarifasForm.porcentajeGym) || 33;

    try {
      await setDoc(doc(db, 'tenants', activeTenantId), {
        ...currentTenant,
        adminUid: currentTenant.adminUid || user.uid,
        tarifa2Dias: Number(tarifasForm.tarifa2Dias) || 0,
        tarifa3Dias: Number(tarifasForm.tarifa3Dias) || 0,
        tarifa5Dias: Number(tarifasForm.tarifa5Dias) || 0,
        porcentajeProfesor: profPct,
        porcentajeGym: gymPct,
        cupoMaximoDefault: Number(cupoInput) || 12,
        updatedAt: new Date().toISOString()
      });
      showTempBanner(`Tarifas y Cupo Máximo actualizados para ${currentTenant.nombre}.`);
    } catch (err) {
      alert('Error al actualizar tarifas: ' + err.message);
    }
  };

  // ==================== INTERCONNECTED CALCULATIONS (ACTIVE TENANT) ====================
  const filteredAlumnos = useMemo(() => {
    return alumnos.filter((a) => {
      const q = searchAlumno.toLowerCase().trim();
      const matchSearch =
        !q ||
        a.nombreCompleto.toLowerCase().includes(q) ||
        a.correo.toLowerCase().includes(q) ||
        a.telefono.toLowerCase().includes(q) ||
        a.planEntrenamiento.toLowerCase().includes(q);
      const matchPlan = filterPlan === 'TODOS' || a.planEntrenamiento === filterPlan;
      const matchDias = filterDias === 'TODOS' || Number(a.diasPorSemana) === Number(filterDias);
      return matchSearch && matchPlan && matchDias;
    });
  }, [alumnos, searchAlumno, filterPlan, filterDias]);

  const cupoMaximo = Number(currentTenant.cupoMaximoDefault) || 12;

  const turnosMatrix = useMemo(() => {
    const matrix = {};
    for (const hora of FRANJAS_HORARIAS) {
      matrix[hora] = {};
      for (const d of DIAS_SEMANA) {
        const anotados = alumnos.filter((a) => a.activo !== false && a[d.key] === hora);
        const count = anotados.length;
        const disponibles = Math.max(0, cupoMaximo - count);
        matrix[hora][d.key] = {
          inscriptos: anotados,
          count,
          disponibles
        };
      }
    }
    return matrix;
  }, [alumnos, cupoMaximo]);

  const turnoSeleccionadoData = useMemo(() => {
    return (
      turnosMatrix[selectedHorario]?.[selectedDia] || {
        inscriptos: [],
        count: 0,
        disponibles: cupoMaximo
      }
    );
  }, [turnosMatrix, selectedHorario, selectedDia, cupoMaximo]);

  const getResumenMes = (mesNombre, listCobranzas = cobranzas, tenantCfg = currentTenant) => {
    const pagosMes = listCobranzas.filter((c) => c.mes === mesNombre);
    const totalRecaudado = pagosMes.reduce((acc, c) => acc + (Number(c.totalPagado) || 0), 0);
    const subtotalEfectivo = pagosMes
      .filter((c) => c.metodoPago === 'Efectivo')
      .reduce((acc, c) => acc + (Number(c.totalPagado) || 0), 0);
    const subtotalTransferencia = pagosMes
      .filter((c) => c.metodoPago === 'Transferencia')
      .reduce((acc, c) => acc + (Number(c.totalPagado) || 0), 0);
    const pctProf = Number(tenantCfg.porcentajeProfesor) || 67;
    const pctGym = Number(tenantCfg.porcentajeGym) || 33;
    const liquidacionProfesor = Math.round((totalRecaudado * pctProf) / 100);
    const netoGym = Math.round((totalRecaudado * pctGym) / 100);

    return {
      pagosMes,
      totalRecaudado,
      subtotalEfectivo,
      subtotalTransferencia,
      liquidacionProfesor,
      netoGym
    };
  };

  const dashboardStats = useMemo(() => {
    const alumnosActivos = alumnos.filter((a) => a.activo !== false);
    const totalRecaudadoAnual = cobranzas.reduce((acc, c) => acc + (Number(c.totalPagado) || 0), 0);

    let totalAsistenciasSemanales = 0;
    const asistenciaPorDia = {
      lunes: 0,
      martes: 0,
      miercoles: 0,
      jueves: 0,
      viernes: 0
    };

    for (const a of alumnosActivos) {
      for (const d of DIAS_SEMANA) {
        if (a[d.key] && a[d.key].trim() !== '') {
          totalAsistenciasSemanales += 1;
          asistenciaPorDia[d.key] += 1;
        }
      }
    }

    const capacidadSemanalTotal = FRANJAS_HORARIAS.length * DIAS_SEMANA.length * cupoMaximo;
    const ocupacionGlobalPct =
      capacidadSemanalTotal > 0
        ? Math.round((totalAsistenciasSemanales / capacidadSemanalTotal) * 100)
        : 0;

    const porModalidad = PLANES_ENTRENAMIENTO.map((plan) => {
      const count = alumnosActivos.filter((a) => a.planEntrenamiento === plan).length;
      const pct = alumnosActivos.length > 0 ? Math.round((count / alumnosActivos.length) * 100) : 0;
      const ingresosPlan = cobranzas
        .filter((c) => c.actividad === plan)
        .reduce((s, c) => s + (Number(c.totalPagado) || 0), 0);
      return { plan, count, pct, ingresosPlan };
    }).sort((a, b) => b.count - a.count);

    const rangosEdad = [
      { label: 'Sub-20 (< 20 años)', min: 0, max: 19 },
      { label: 'Jóvenes (20 - 29 años)', min: 20, max: 29 },
      { label: 'Adultos (30 - 39 años)', min: 30, max: 39 },
      { label: 'Adultos Medios (40 - 49 años)', min: 40, max: 49 },
      { label: 'Senior (50+ años)', min: 50, max: 200 }
    ].map((r) => {
      const count = alumnosActivos.filter((a) => a.edad >= r.min && a.edad <= r.max).length;
      const pct = alumnosActivos.length > 0 ? Math.round((count / alumnosActivos.length) * 100) : 0;
      return { ...r, count, pct };
    });

    const capMaxFranjaSemanal = cupoMaximo * DIAS_SEMANA.length;
    const ocupacionPorFranja = FRANJAS_HORARIAS.map((hora) => {
      let inscriptosFranja = 0;
      for (const d of DIAS_SEMANA) {
        inscriptosFranja += turnosMatrix[hora]?.[d.key]?.count || 0;
      }
      const pct =
        capMaxFranjaSemanal > 0 ? Math.round((inscriptosFranja / capMaxFranjaSemanal) * 100) : 0;
      return {
        hora,
        inscriptosFranja,
        capMaxFranjaSemanal,
        pct
      };
    });

    const distribucionDias = DIAS_SEMANA.map((d) => {
      const count = asistenciaPorDia[d.key];
      const pct =
        totalAsistenciasSemanales > 0
          ? Math.round((count / totalAsistenciasSemanales) * 100)
          : 0;
      return {
        ...d,
        count,
        pct
      };
    });

    return {
      totalAlumnosActivos: alumnosActivos.length,
      totalRecaudadoAnual,
      totalAsistenciasSemanales,
      capacidadSemanalTotal,
      ocupacionGlobalPct,
      porModalidad,
      rangosEdad,
      ocupacionPorFranja,
      distribucionDias
    };
  }, [alumnos, cobranzas, cupoMaximo, turnosMatrix]);

  // ==================== MULTI-TENANT CONSOLIDATED STATS (FOR ADMIN) ====================
  const multiTenantSummary = useMemo(() => {
    const rows = ['gym-1', 'gym-2', 'gym-3'].map((tId) => {
      const tCfg = tenantsMap[tId] || INITIAL_TENANTS.find((x) => x.tenantId === tId);
      const tAlumnos = (alumnosByTenant[tId] || []).filter((a) => a.activo !== false);
      const tCobranzas = cobranzasByTenant[tId] || [];

      const oct = getResumenMes('Octubre', tCobranzas, tCfg).totalRecaudado;
      const nov = getResumenMes('Noviembre', tCobranzas, tCfg).totalRecaudado;
      const dic = getResumenMes('Diciembre', tCobranzas, tCfg).totalRecaudado;
      const totalTrimestre = oct + nov + dic;
      const netoGym = Math.round((totalTrimestre * (Number(tCfg.porcentajeGym) || 33)) / 100);
      const liqProf = Math.round((totalTrimestre * (Number(tCfg.porcentajeProfesor) || 67)) / 100);

      let turnosSem = 0;
      for (const a of tAlumnos) {
        for (const d of DIAS_SEMANA) {
          if (a[d.key]) turnosSem += 1;
        }
      }
      const capSem =
        FRANJAS_HORARIAS.length * DIAS_SEMANA.length * (Number(tCfg.cupoMaximoDefault) || 12);
      const ocupacionPct = capSem > 0 ? Math.round((turnosSem / capSem) * 100) : 0;

      return {
        tenantId: tId,
        config: tCfg,
        alumnosCount: tAlumnos.length,
        turnosSem,
        capSem,
        ocupacionPct,
        oct,
        nov,
        dic,
        totalTrimestre,
        netoGym,
        liqProf
      };
    });

    const totalAlumnosRed = rows.reduce((s, r) => s + r.alumnosCount, 0);
    const totalFacturacionRed = rows.reduce((s, r) => s + r.totalTrimestre, 0);
    const totalNetoGymRed = rows.reduce((s, r) => s + r.netoGym, 0);
    const totalLiqProfRed = rows.reduce((s, r) => s + r.liqProf, 0);
    const totalTurnosRed = rows.reduce((s, r) => s + r.turnosSem, 0);
    const totalCapRed = rows.reduce((s, r) => s + r.capSem, 0);
    const ocupacionRedPct = totalCapRed > 0 ? Math.round((totalTurnosRed / totalCapRed) * 100) : 0;

    // Cross-tenant member search
    const allAlumnosWithGym = [];
    ['gym-1', 'gym-2', 'gym-3'].forEach((tId) => {
      const gymName = tenantsMap[tId]?.nombre || tId;
      (alumnosByTenant[tId] || []).forEach((a) => {
        allAlumnosWithGym.push({ ...a, gymName, tenantId: tId });
      });
    });

    const filteredGlobalAlumnos = allAlumnosWithGym.filter((a) => {
      const q = globalSearchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        a.nombreCompleto.toLowerCase().includes(q) ||
        a.correo.toLowerCase().includes(q) ||
        a.gymName.toLowerCase().includes(q) ||
        a.planEntrenamiento.toLowerCase().includes(q)
      );
    });

    return {
      rows,
      totalAlumnosRed,
      totalFacturacionRed,
      totalNetoGymRed,
      totalLiqProfRed,
      totalTurnosRed,
      ocupacionRedPct,
      filteredGlobalAlumnos
    };
  }, [tenantsMap, alumnosByTenant, cobranzasByTenant, globalSearchQuery]);

  // ==================== EXPORT CURRENT SHEET TO CSV ====================
  const handleExportCSV = () => {
    let headers = [];
    let rows = [];

    if (activeSheet === 'AdminGlobal') {
      headers = [
        'ID Cliente',
        'Gimnasio',
        'Sede',
        'Cliente Responsable',
        'Email Cliente',
        'Plan SaaS',
        'Alumnos Activos',
        'Octubre',
        'Noviembre',
        'Diciembre',
        'Total Trimestre',
        'Neto Gym'
      ];
      rows = multiTenantSummary.rows.map((r) => [
        r.tenantId,
        r.config.nombre,
        r.config.sede,
        r.config.clientNombre,
        r.config.clientEmail,
        r.config.planSaaS,
        r.alumnosCount,
        r.oct,
        r.nov,
        r.dic,
        r.totalTrimestre,
        r.netoGym
      ]);
    } else if (activeSheet === 'Alumnos') {
      headers = [
        'Gimnasio',
        'Nombre Completo',
        'Telefono',
        'Edad',
        'Dias por Semana',
        'Plan de Entrenamiento',
        'Lunes',
        'Martes',
        'Miercoles',
        'Jueves',
        'Viernes',
        'Correo Electronico',
        'Fecha de Inscripcion'
      ];
      rows = alumnos.map((a) => [
        currentTenant.nombre,
        a.nombreCompleto,
        a.telefono,
        a.edad,
        a.diasPorSemana,
        a.planEntrenamiento,
        a.lunes || '-',
        a.martes || '-',
        a.miercoles || '-',
        a.jueves || '-',
        a.viernes || '-',
        a.correo,
        a.fechaInscripcion
      ]);
    } else if (activeSheet === 'Turnos') {
      headers = [
        'Gimnasio',
        'Horario',
        'Cupo Maximo',
        'Lunes (Insc/Disp)',
        'Martes (Insc/Disp)',
        'Miercoles (Insc/Disp)',
        'Jueves (Insc/Disp)',
        'Viernes (Insc/Disp)'
      ];
      rows = FRANJAS_HORARIAS.map((h) => [
        currentTenant.nombre,
        h,
        cupoMaximo,
        `${turnosMatrix[h].lunes.count}/${turnosMatrix[h].lunes.disponibles}`,
        `${turnosMatrix[h].martes.count}/${turnosMatrix[h].martes.disponibles}`,
        `${turnosMatrix[h].miercoles.count}/${turnosMatrix[h].miercoles.disponibles}`,
        `${turnosMatrix[h].jueves.count}/${turnosMatrix[h].jueves.disponibles}`,
        `${turnosMatrix[h].viernes.count}/${turnosMatrix[h].viernes.disponibles}`
      ]);
    } else if (MESES_COBRANZA.includes(activeSheet)) {
      headers = [
        'Gimnasio',
        'Mes',
        'Alumno',
        'Dias',
        'Actividad',
        'Precio Cuota',
        'Descuento / Inscripcion',
        'Total Pagado',
        'Metodo de Pago',
        'Fecha de Pago',
        'Observaciones'
      ];
      rows = cobranzas
        .filter((c) => c.mes === activeSheet)
        .map((c) => [
          currentTenant.nombre,
          c.mes,
          c.alumnoNombre,
          c.dias,
          c.actividad,
          c.precioCuota,
          c.descuentoInscripcion,
          c.totalPagado,
          c.metodoPago,
          c.fechaPago,
          c.observaciones
        ]);
    } else {
      headers = ['Gimnasio', 'Modalidad', 'Alumnos Activos', '% Participacion', 'Ingresos'];
      rows = dashboardStats.porModalidad.map((m) => [
        currentTenant.nombre,
        m.plan,
        m.count,
        `${m.pct}%`,
        m.ingresosPlan
      ]);
    }

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers, ...rows]
        .map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
        .join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `AboroGym_${activeTenantId}_${activeSheet}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Formula bar helper text
  const activeFormulaInfo = useMemo(() => {
    if (activeSheet === 'AdminGlobal') {
      return {
        cell: 'MultiTenant!A1:L4',
        formula:
          '=QUERY({Gym1!A2:L; Gym2!A2:L; Gym3!A2:L}; "SELECT Tenant, COUNT(Alumnos), SUM(Cobranzas) GROUP BY Tenant")'
      };
    }
    if (activeSheet === 'Alumnos') {
      return {
        cell: `${activeTenantId}!Alumnos_A2:L${alumnos.length + 1}`,
        formula: `=QUERY(Firestore!tenants/${activeTenantId}/alumnos; "SELECT * WHERE activo = TRUE")`
      };
    }
    if (activeSheet === 'Turnos') {
      const colLetter = { lunes: 'F', martes: 'G', miercoles: 'H', jueves: 'I', viernes: 'J' }[
        selectedDia
      ];
      return {
        cell: `${activeTenantId}!Turnos_${colLetter}_${selectedHorario}`,
        formula: `=COUNTIF(${activeTenantId}_Alumnos!${colLetter}$2:${colLetter}$200; "${selectedHorario}")  |  Disponibles: =CupoMax(${cupoMaximo}) - Inscriptos(${turnoSeleccionadoData.count})`
      };
    }
    if (MESES_COBRANZA.includes(activeSheet)) {
      return {
        cell: `${activeTenantId}!${activeSheet}_G2:G100`,
        formula: `=SUM(${activeTenantId}_${activeSheet}!TotalPagado)  |  Profesor (${currentTenant.porcentajeProfesor}%) / Gym (${currentTenant.porcentajeGym}%)`
      };
    }
    return {
      cell: `${activeTenantId}!Dashboard_KPI`,
      formula: `=SPARKLINE(${activeTenantId}_Cobranzas!Octubre:Diciembre)  |  Sede: ${currentTenant.nombre}`
    };
  }, [
    activeSheet,
    activeTenantId,
    alumnos.length,
    selectedDia,
    selectedHorario,
    cupoMaximo,
    turnoSeleccionadoData.count,
    currentTenant
  ]);

  if (authLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#022c22',
          color: 'white',
          fontWeight: 600
        }}
      >
        Cargando Plataforma Multi-Tenant AboroGym (aborogym-5d109)...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="auth-wrapper">
        <div className="auth-hero">
          <div className="auth-brand">
            <div className="auth-logo-badge">
              <Dumbbell size={26} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.25rem', letterSpacing: '-0.02em' }}>
                ABOROGYM CLOUD • MULTI-TENANT
              </div>
              <div style={{ fontSize: '0.76rem', color: 'rgba(255,255,255,0.7)' }}>
                Plataforma SaaS para 3 Gimnasios + Panel Global Super Admin
              </div>
            </div>
          </div>

          <div className="auth-hero-content">
            <div className="auth-pill">
              <Sparkles size={14} /> Arquitectura Multi-Tenant • 3 Clientes + Super Admin
            </div>
            <h1>3 Gimnasios independientes. 1 Tablero Maestro para el Admin.</h1>
            <p>
              Cada gimnasio cliente opera sus propias hojas interconectadas (<strong>Alumnos</strong>
              , <strong>Turnos y Cupos</strong>, <strong>Cobranzas Oct/Nov/Dic</strong> y{' '}
              <strong>Dashboard</strong>), mientras que el <strong>Super Admin</strong> supervisa y
              compara las 3 sedes en tiempo real.
            </p>

            <div className="auth-sheets-preview">
              <div className="auth-sheet-card">
                <h4>
                  <Crown size={16} /> Super Admin Consolidado
                </h4>
                <p>
                  Acceso total a las 3 sedes, métricas consolidadas, buscador global y gestión de
                  accesos por cliente.
                </p>
              </div>
              <div className="auth-sheet-card">
                <h4>
                  <Building2 size={16} /> Cliente 1: AboroGym Central
                </h4>
                <p>Sede Palermo • Tarifas, turnos, alumnos y cobranzas aisladas por tenant.</p>
              </div>
              <div className="auth-sheet-card">
                <h4>
                  <Building2 size={16} /> Cliente 2: Titanium Norte
                </h4>
                <p>Sede Belgrano • Control de aforo, cuotas y liquidación 65% Prof / 35% Gym.</p>
              </div>
              <div className="auth-sheet-card">
                <h4>
                  <Building2 size={16} /> Cliente 3: Sparta Box Sur
                </h4>
                <p>Sede Caballito • Gestión integral de socios y KPIs en tiempo real.</p>
              </div>
            </div>
          </div>

          <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)' }}>
            Firebase Project ID: <strong>aborogym-5d109</strong> • Aislamiento Multi-Tenant en
            Firestore Security Rules
          </div>
        </div>

        <div className="auth-panel-container">
          <div className="auth-card">
            <h2>Acceso Multi-Tenant</h2>
            <p className="subtitle">
              Ingresa como <strong>Super Admin</strong> ({SUPER_ADMIN_EMAIL}) para ver los 3
              gimnasios o con el correo de un <strong>Cliente</strong> para ir a su sede.
            </p>

            <div className="auth-tabs">
              <button
                type="button"
                className={`auth-tab-btn ${authMode === 'login' ? 'active' : ''}`}
                onClick={() => {
                  setAuthMode('login');
                  setAuthError('');
                }}
              >
                Iniciar Sesión
              </button>
              <button
                type="button"
                className={`auth-tab-btn ${authMode === 'register' ? 'active' : ''}`}
                onClick={() => {
                  setAuthMode('register');
                  setAuthError('');
                }}
              >
                Crear Cuenta
              </button>
            </div>

            {authError && (
              <div className="alert-box alert-error">
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={handleEmailAuth}>
              <div className="form-group">
                <label>Correo Electrónico</label>
                <input
                  type="email"
                  required
                  className="input-control"
                  placeholder="davidrmrz10@gmail.com o cliente1@aborogym.com"
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
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <button type="submit" className="btn btn-primary btn-full" disabled={authBusy}>
                {authBusy
                  ? 'Procesando...'
                  : authMode === 'login'
                  ? 'Ingresar con Correo y Contraseña'
                  : 'Registrar Cuenta'}
              </button>
            </form>

            <div className="auth-divider">
              <span>o continuar con</span>
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={authBusy}
              className="btn btn-secondary btn-full"
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                />
              </svg>
              Continuar con Google Sign-In
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="workbook-shell">
      {/* Top Emerald Multi-Tenant Ribbon */}
      <header className="top-RIBBON">
        <div className="brand-cluster">
          <div className="brand-icon">
            <Dumbbell size={22} />
          </div>
          <div className="brand-titles">
            <h1>
              {activeSheet === 'AdminGlobal'
                ? 'AboroGym Cloud — Consola Global Multi-Tenant (3 Gimnasios)'
                : `${currentTenant.nombre}`}
              <span className="project-badge">
                {isEffectiveAdmin ? '👑 SUPER ADMIN' : `🏢 CLIENTE (${currentTenant.tenantId})`}
              </span>
            </h1>
            <p>
              {activeSheet === 'AdminGlobal'
                ? 'Vista ejecutiva consolidada de los 3 clientes • Selección y auditoría en tiempo real'
                : `Sede: ${currentTenant.sede} • Cliente: ${currentTenant.clientNombre} (${currentTenant.clientEmail})`}
            </p>
          </div>
        </div>

        <div className="ribbon-actions">
          {/* Selector de Gimnasio Activo (visible si es Super Admin) */}
          {isEffectiveAdmin && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                background: 'rgba(2, 44, 34, 0.65)',
                padding: '0.3rem 0.6rem',
                borderRadius: 8,
                border: '1px solid rgba(52, 211, 153, 0.35)'
              }}
            >
              <Building2 size={15} color="#34d399" />
              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#a7f3d0' }}>
                GIMNASIO ACTIVO:
              </span>
              <select
                value={activeTenantId}
                onChange={(e) => {
                  setActiveTenantId(e.target.value);
                  if (activeSheet === 'AdminGlobal') {
                    setActiveSheet('Alumnos');
                  }
                }}
                style={{
                  background: '#064e3b',
                  color: 'white',
                  border: '1px solid #10b981',
                  borderRadius: 6,
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {['gym-1', 'gym-2', 'gym-3'].map((tId) => {
                  const t = tenantsMap[tId] || INITIAL_TENANTS.find((x) => x.tenantId === tId);
                  return (
                    <option key={tId} value={tId}>
                      {t.nombre} ({tId})
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* Simulador de Vista de Cliente para que el Super Admin pruebe cómo ve cada cliente */}
          {userAccessInfo.isRealSuperAdmin && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                background: 'rgba(255,255,255,0.08)',
                padding: '0.3rem 0.6rem',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.16)'
              }}
              title="Permite simular exactamente lo que ve cada uno de los 3 clientes al iniciar sesión"
            >
              <Eye size={14} color="#fbbf24" />
              <select
                value={simulatedRole}
                onChange={(e) => setSimulatedRole(e.target.value)}
                style={{
                  background: 'transparent',
                  color: 'white',
                  border: 'none',
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <option value="ADMIN" style={{ color: '#0f172a' }}>
                  Vista: Super Admin (Todos)
                </option>
                <option value="gym-1" style={{ color: '#0f172a' }}>
                  Simular Cliente 1 (gym-1)
                </option>
                <option value="gym-2" style={{ color: '#0f172a' }}>
                  Simular Cliente 2 (gym-2)
                </option>
                <option value="gym-3" style={{ color: '#0f172a' }}>
                  Simular Cliente 3 (gym-3)
                </option>
              </select>
            </div>
          )}

          {userAccessInfo.isRealSuperAdmin && (
            <button
              type="button"
              className="btn btn-emerald-soft"
              onClick={() => handleSeedMultiTenant(true)}
              disabled={seeding}
              title="Cargar o restaurar los datos de los 3 gimnasios en Firestore"
            >
              <RefreshCw size={15} />
              {seeding ? 'Sincronizando...' : 'Restaurar 3 Gimnasios Demo'}
            </button>
          )}

          <button
            type="button"
            className="btn btn-emerald-soft"
            onClick={handleExportCSV}
            title="Exportar hoja actual a CSV"
          >
            <Download size={15} />
            Exportar CSV
          </button>

          <div className="user-chip">
            <ShieldCheck size={15} color="#34d399" />
            <span>{user.email || user.displayName}</span>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem' }}
            onClick={() => signOut(auth)}
          >
            <LogOut size={14} /> Salir
          </button>
        </div>
      </header>

      {/* Google Sheets Formula & Context Bar */}
      <div className="formula-bar">
        <span className="cell-ref-box">{activeFormulaInfo.cell}</span>
        <span className="fx-badge">fx</span>
        <span className="formula-text">{activeFormulaInfo.formula}</span>
        {statusBanner && (
          <span className="badge badge-emerald">
            <CheckCircle2 size={13} /> {statusBanner}
          </span>
        )}
      </div>

      {/* Sheet Tabs Navigation */}
      <nav className="sheet-tabs-bar">
        {isEffectiveAdmin && (
          <button
            type="button"
            className={`sheet-tab ${activeSheet === 'AdminGlobal' ? 'active' : ''}`}
            onClick={() => setActiveSheet('AdminGlobal')}
          >
            <Crown size={15} color={activeSheet === 'AdminGlobal' ? '#fbbf24' : '#d97706'} />
            0. Red Multi-Tenant (3 Gimnasios)
            <span className="sheet-tab-badge">Admin</span>
          </button>
        )}

        <button
          type="button"
          className={`sheet-tab ${activeSheet === 'Alumnos' ? 'active' : ''}`}
          onClick={() => setActiveSheet('Alumnos')}
        >
          <Users size={15} />
          1. Alumnos ({currentTenant.nombre.split(' ')[0]})
          <span className="sheet-tab-badge">{alumnos.length}</span>
        </button>

        <button
          type="button"
          className={`sheet-tab ${activeSheet === 'Turnos' ? 'active' : ''}`}
          onClick={() => setActiveSheet('Turnos')}
        >
          <CalendarClock size={15} />
          2. Turnos y Cupos
          <span className="sheet-tab-badge">Max {cupoMaximo}</span>
        </button>

        {MESES_COBRANZA.map((mes) => {
          const countMes = cobranzas.filter((c) => c.mes === mes).length;
          return (
            <button
              key={mes}
              type="button"
              className={`sheet-tab ${activeSheet === mes ? 'active' : ''}`}
              onClick={() => setActiveSheet(mes)}
            >
              <DollarSign size={15} />
              Cobranzas: {mes}
              <span className="sheet-tab-badge">{countMes}</span>
            </button>
          );
        })}

        <button
          type="button"
          className={`sheet-tab ${activeSheet === 'Dashboard' ? 'active' : ''}`}
          onClick={() => setActiveSheet('Dashboard')}
        >
          <BarChart3 size={15} />
          4. Dashboard Sede
        </button>
      </nav>

      {/* ==================== ACTIVE WORKSPACE ==================== */}
      <main className="sheet-workspace">
        {/* ==================== HOJA 0: SUPER ADMIN CONSOLIDADO MULTI-TENANT ==================== */}
        {activeSheet === 'AdminGlobal' && isEffectiveAdmin && (
          <div>
            <div className="section-header-card">
              <div className="section-title-group">
                <h2>
                  <Crown size={22} color="#d97706" /> Panel Maestro Multi-Tenant — Supervisión de
                  los 3 Gimnasios Clientes
                </h2>
                <p>
                  Como <strong>Super Admin ({user.email})</strong> tienes visibilidad consolidada de
                  la facturación, alumnos y ocupación de los 3 clientes. Haz clic en cualquier
                  gimnasio para abrir e inspeccionar sus hojas individuales.
                </p>
              </div>
            </div>

            {/* 4 Scorecards Globales Consolidados */}
            <div className="kpi-grid-4">
              <div className="kpi-card emerald-dark">
                <div className="kpi-label">
                  <span>TOTAL ALUMNOS EN LA RED (3 SEDES)</span>
                  <Users size={16} />
                </div>
                <div className="kpi-value">{multiTenantSummary.totalAlumnosRed} socios</div>
                <div className="kpi-sub">
                  {multiTenantSummary.totalTurnosRed} asistencias semanales combinadas
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-label">
                  <span>FACTURACIÓN CONSOLIDADA (3 CLIENTES)</span>
                  <TrendingUp size={16} color="#059669" />
                </div>
                <div className="kpi-value" style={{ color: '#047857' }}>
                  {formatCurrency(multiTenantSummary.totalFacturacionRed)}
                </div>
                <div className="kpi-sub">Suma acumulada Octubre + Noviembre + Diciembre</div>
              </div>

              <div className="kpi-card">
                <div className="kpi-label">
                  <span>NETO GIMNASIOS vs. PROFESORES</span>
                  <Wallet size={16} color="#059669" />
                </div>
                <div className="kpi-value" style={{ fontSize: '1.35rem', color: '#064e3b' }}>
                  Neto Gyms: {formatCurrency(multiTenantSummary.totalNetoGymRed)}
                </div>
                <div className="kpi-sub">
                  Liquidación Profesores: {formatCurrency(multiTenantSummary.totalLiqProfRed)}
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-label">
                  <span>OCUPACIÓN PROMEDIO DE LA RED</span>
                  <CalendarClock size={16} color="#d97706" />
                </div>
                <div className="kpi-value">{multiTenantSummary.ocupacionRedPct}%</div>
                <div className="kpi-sub">3 gimnasios activos en Cloud Firestore</div>
              </div>
            </div>

            {/* Tarjetas de Acceso Rápido a los 3 Clientes */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '1.15rem',
                marginBottom: '1.25rem'
              }}
            >
              {multiTenantSummary.rows.map((r, idx) => (
                <div
                  key={r.tenantId}
                  className="panel-card"
                  style={{
                    marginBottom: 0,
                    border:
                      activeTenantId === r.tenantId
                        ? '2px solid #059669'
                        : '1px solid var(--slate-200)'
                  }}
                >
                  <div className="panel-header">
                    <h3>
                      <Building2 size={16} /> Cliente #{idx + 1}: {r.config.nombre}
                    </h3>
                    <span className="badge badge-emerald">{r.config.planSaaS}</span>
                  </div>
                  <div className="panel-body">
                    <div
                      style={{
                        fontSize: '0.82rem',
                        color: '#475569',
                        marginBottom: '0.85rem',
                        display: 'grid',
                        gap: '0.25rem'
                      }}
                    >
                      <div>
                        <strong>Sede:</strong> {r.config.sede}
                      </div>
                      <div>
                        <strong>Responsable:</strong> {r.config.clientNombre}
                      </div>
                      <div>
                        <strong>Correo Cliente:</strong>{' '}
                        <code
                          style={{
                            background: '#f1f5f9',
                            padding: '0.1rem 0.4rem',
                            borderRadius: 4,
                            color: '#064e3b',
                            fontWeight: 600
                          }}
                        >
                          {r.config.clientEmail}
                        </code>
                      </div>
                      <div>
                        <strong>Tarifas (2 / 3 / 5 días):</strong>{' '}
                        {formatCurrency(r.config.tarifa2Dias)} /{' '}
                        {formatCurrency(r.config.tarifa3Dias)} /{' '}
                        {formatCurrency(r.config.tarifa5Dias)}
                      </div>
                      <div>
                        <strong>Reparto:</strong> {r.config.porcentajeProfesor}% Profesor /{' '}
                        {r.config.porcentajeGym}% Gym • <strong>Cupo Máx:</strong>{' '}
                        {r.config.cupoMaximoDefault}
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr 1fr',
                        gap: '0.5rem',
                        background: '#f8fafc',
                        padding: '0.65rem',
                        borderRadius: 8,
                        border: '1px solid #e2e8f0',
                        marginBottom: '0.9rem',
                        textAlign: 'center'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700 }}>
                          ALUMNOS
                        </div>
                        <div className="mono" style={{ fontWeight: 800, color: '#064e3b' }}>
                          {r.alumnosCount}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700 }}>
                          RECAUDACIÓN
                        </div>
                        <div className="mono" style={{ fontWeight: 800, color: '#047857' }}>
                          {formatCurrency(r.totalTrimestre)}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700 }}>
                          NETO GYM
                        </div>
                        <div className="mono" style={{ fontWeight: 800, color: '#0f172a' }}>
                          {formatCurrency(r.netoGym)}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ flex: 1 }}
                        onClick={() => {
                          setActiveTenantId(r.tenantId);
                          setActiveSheet('Alumnos');
                        }}
                      >
                        Abrir Hojas del Gimnasio <ArrowRight size={15} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => handleStartEditTenant(r.config)}
                        title="Configurar nombre, sede y correo de acceso del cliente"
                      >
                        <Edit3 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Modal / Panel de Edición de Cliente si se seleccionó uno */}
            {editingTenantId && (
              <div className="panel-card" style={{ border: '2px solid #059669' }}>
                <div className="panel-header">
                  <h3>
                    <Edit3 size={16} /> Configurar Cliente y Acceso Multi-Tenant ({editingTenantId})
                  </h3>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                    onClick={() => setEditingTenantId(null)}
                  >
                    Cerrar
                  </button>
                </div>
                <form className="panel-body" onSubmit={handleSaveTenantClientInfo}>
                  <div className="form-grid-6" style={{ alignItems: 'end' }}>
                    <div className="col-span-2">
                      <label
                        style={{
                          display: 'block',
                          fontSize: '0.73rem',
                          fontWeight: 700,
                          marginBottom: 4
                        }}
                      >
                        NOMBRE DEL GIMNASIO *
                      </label>
                      <input
                        type="text"
                        required
                        className="input-control"
                        value={tenantEditForm.nombre}
                        onChange={(e) =>
                          setTenantEditForm({ ...tenantEditForm, nombre: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '0.73rem',
                          fontWeight: 700,
                          marginBottom: 4
                        }}
                      >
                        DIRECCIÓN / SEDE *
                      </label>
                      <input
                        type="text"
                        required
                        className="input-control"
                        value={tenantEditForm.sede}
                        onChange={(e) =>
                          setTenantEditForm({ ...tenantEditForm, sede: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '0.73rem',
                          fontWeight: 700,
                          marginBottom: 4
                        }}
                      >
                        NOMBRE DEL CLIENTE *
                      </label>
                      <input
                        type="text"
                        required
                        className="input-control"
                        value={tenantEditForm.clientNombre}
                        onChange={(e) =>
                          setTenantEditForm({ ...tenantEditForm, clientNombre: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '0.73rem',
                          fontWeight: 700,
                          marginBottom: 4
                        }}
                      >
                        EMAIL ACCESO CLIENTE *
                      </label>
                      <input
                        type="email"
                        required
                        className="input-control"
                        value={tenantEditForm.clientEmail}
                        onChange={(e) =>
                          setTenantEditForm({ ...tenantEditForm, clientEmail: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <button type="submit" className="btn btn-primary btn-full">
                        Guardar Cliente
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}

            {/* Tabla Comparativa Consolidada de los 3 Gimnasios */}
            <div className="panel-card">
              <div className="panel-header">
                <h3>
                  <BarChart3 size={16} /> Matriz Comparativa de Rendimiento Financiero y Operativo
                  (3 Gimnasios)
                </h3>
              </div>
              <div className="table-scroll">
                <table className="sheet-table">
                  <thead>
                    <tr>
                      <th className="center">#</th>
                      <th>ID Tenant</th>
                      <th>Gimnasio / Sede</th>
                      <th>Cliente Asignado</th>
                      <th className="center">Socios Activos</th>
                      <th className="center">Ocupación Semanal</th>
                      <th className="right">Cobranzas Octubre</th>
                      <th className="right">Cobranzas Noviembre</th>
                      <th className="right">Cobranzas Diciembre</th>
                      <th className="right">Total Trimestre</th>
                      <th className="right">Liquidación Prof.</th>
                      <th className="right">Neto Gimnasio</th>
                      <th className="center">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {multiTenantSummary.rows.map((r, i) => (
                      <tr key={r.tenantId}>
                        <td className="row-index-cell">{i + 2}</td>
                        <td className="mono" style={{ fontWeight: 700 }}>
                          {r.tenantId}
                        </td>
                        <td>
                          <div style={{ fontWeight: 800, color: '#064e3b' }}>{r.config.nombre}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {r.config.sede}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{r.config.clientNombre}</div>
                          <div className="mono" style={{ fontSize: '0.74rem', color: '#475569' }}>
                            {r.config.clientEmail}
                          </div>
                        </td>
                        <td className="center">
                          <span className="badge badge-emerald">{r.alumnosCount} socios</span>
                        </td>
                        <td className="center mono">
                          {r.turnosSem}/{r.capSem} ({r.ocupacionPct}%)
                        </td>
                        <td className="right mono">{formatCurrency(r.oct)}</td>
                        <td className="right mono">{formatCurrency(r.nov)}</td>
                        <td className="right mono">{formatCurrency(r.dic)}</td>
                        <td className="right mono" style={{ fontWeight: 800, color: '#064e3b' }}>
                          {formatCurrency(r.totalTrimestre)}
                        </td>
                        <td className="right mono" style={{ color: '#d97706' }}>
                          {formatCurrency(r.liqProf)} ({r.config.porcentajeProfesor}%)
                        </td>
                        <td className="right mono" style={{ fontWeight: 800, color: '#047857' }}>
                          {formatCurrency(r.netoGym)} ({r.config.porcentajeGym}%)
                        </td>
                        <td className="center">
                          <button
                            type="button"
                            className="btn btn-emerald-soft"
                            style={{ padding: '0.3rem 0.65rem', fontSize: '0.76rem' }}
                            onClick={() => {
                              setActiveTenantId(r.tenantId);
                              setActiveSheet('Dashboard');
                            }}
                          >
                            Ver Dashboard
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Buscador Global Cross-Tenant de Socios */}
            <div className="panel-card">
              <div className="panel-header light">
                <h3>
                  <Search size={16} color="#047857" /> Buscador Global de Alumnos en los 3 Gimnasios
                  ({multiTenantSummary.filteredGlobalAlumnos.length} socios)
                </h3>
                <input
                  type="text"
                  className="input-control"
                  style={{ maxWidth: 340 }}
                  placeholder="Filtrar por socio, gimnasio, plan o correo..."
                  value={globalSearchQuery}
                  onChange={(e) => setGlobalSearchQuery(e.target.value)}
                />
              </div>
              <div className="table-scroll">
                <table className="sheet-table">
                  <thead>
                    <tr>
                      <th className="center">#</th>
                      <th>Gimnasio (Tenant)</th>
                      <th>Nombre del Alumno</th>
                      <th>Teléfono</th>
                      <th className="right">Edad</th>
                      <th className="center">Días/Sem</th>
                      <th>Plan</th>
                      <th>Correo</th>
                      <th className="center">Ir a Sede</th>
                    </tr>
                  </thead>
                  <tbody>
                    {multiTenantSummary.filteredGlobalAlumnos.map((a, idx) => (
                      <tr key={`${a.tenantId}-${a.id}`}>
                        <td className="row-index-cell">{idx + 1}</td>
                        <td>
                          <span className="badge badge-emerald">{a.gymName}</span>
                        </td>
                        <td style={{ fontWeight: 700, color: '#064e3b' }}>{a.nombreCompleto}</td>
                        <td className="mono">{a.telefono}</td>
                        <td className="right mono">{a.edad}</td>
                        <td className="center">{a.diasPorSemana}d</td>
                        <td>{a.planEntrenamiento}</td>
                        <td>{a.correo}</td>
                        <td className="center">
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.55rem', fontSize: '0.74rem' }}
                            onClick={() => {
                              setActiveTenantId(a.tenantId);
                              setActiveSheet('Alumnos');
                            }}
                          >
                            Abrir Sede
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ==================== HOJA 1: ALUMNOS (DE LA SEDE ACTIVA) ==================== */}
        {activeSheet === 'Alumnos' && (
          <div>
            <div className="section-header-card">
              <div className="section-title-group">
                <h2>
                  <Users size={22} color="#047857" /> Hoja "Alumnos" — {currentTenant.nombre}
                </h2>
                <p>
                  Base de datos maestra de socios de <strong>{currentTenant.nombre}</strong> (
                  {currentTenant.sede}). Los turnos asignados impactan en vivo sobre el aforo de
                  esta sede.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                <span className="badge badge-emerald">
                  Activos en sede: {alumnos.filter((a) => a.activo !== false).length} socios
                </span>
              </div>
            </div>

            {/* Formulario de Alta / Edición de Alumno */}
            <div className="panel-card">
              <div className="panel-header">
                <h3>
                  {editingAlumnoId ? <Edit3 size={16} /> : <Plus size={16} />}
                  {editingAlumnoId
                    ? `Editando Socio en ${currentTenant.nombre}`
                    : `Registrar Nuevo Socio en ${currentTenant.nombre}`}
                </h3>
                {editingAlumnoId && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '0.28rem 0.65rem', fontSize: '0.75rem' }}
                    onClick={resetAlumnoForm}
                  >
                    Cancelar Edición
                  </button>
                )}
              </div>
              <form className="panel-body" onSubmit={handleSaveAlumno}>
                <div className="form-grid-6" style={{ marginBottom: '0.85rem' }}>
                  <div className="col-span-2">
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        color: '#334155',
                        marginBottom: 4
                      }}
                    >
                      NOMBRE COMPLETO *
                    </label>
                    <input
                      type="text"
                      required
                      className="input-control"
                      placeholder="Ej: Martín Echeverría"
                      value={alumnoForm.nombreCompleto}
                      onChange={(e) =>
                        setAlumnoForm({ ...alumnoForm, nombreCompleto: e.target.value })
                      }
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        color: '#334155',
                        marginBottom: 4
                      }}
                    >
                      TELÉFONO *
                    </label>
                    <input
                      type="text"
                      required
                      className="input-control"
                      placeholder="11-4589-2310"
                      value={alumnoForm.telefono}
                      onChange={(e) => setAlumnoForm({ ...alumnoForm, telefono: e.target.value })}
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        color: '#334155',
                        marginBottom: 4
                      }}
                    >
                      EDAD *
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={110}
                      required
                      className="input-control num"
                      value={alumnoForm.edad}
                      onChange={(e) => setAlumnoForm({ ...alumnoForm, edad: e.target.value })}
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        color: '#334155',
                        marginBottom: 4
                      }}
                    >
                      DÍAS POR SEMANA *
                    </label>
                    <select
                      className="select-control"
                      value={alumnoForm.diasPorSemana}
                      onChange={(e) =>
                        setAlumnoForm({ ...alumnoForm, diasPorSemana: Number(e.target.value) })
                      }
                    >
                      <option value={2}>2 días / semana</option>
                      <option value={3}>3 días / semana</option>
                      <option value={5}>5 días / semana (Libre)</option>
                    </select>
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        color: '#334155',
                        marginBottom: 4
                      }}
                    >
                      PLAN DE ENTRENAMIENTO *
                    </label>
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

                <div className="form-grid-6" style={{ alignItems: 'end' }}>
                  {DIAS_SEMANA.map((d) => (
                    <div key={d.key}>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          color: '#065f46',
                          marginBottom: 4
                        }}
                      >
                        [{d.label.toUpperCase()}]
                      </label>
                      <select
                        className="select-control mono"
                        value={alumnoForm[d.key]}
                        onChange={(e) =>
                          setAlumnoForm({ ...alumnoForm, [d.key]: e.target.value })
                        }
                      >
                        <option value="">— Sin turno —</option>
                        {FRANJAS_HORARIAS.map((h) => (
                          <option key={h} value={h}>
                            {h} hs
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        color: '#334155',
                        marginBottom: 4
                      }}
                    >
                      FECHA INSCRIPCIÓN
                    </label>
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

                <div
                  style={{
                    display: 'flex',
                    gap: '0.85rem',
                    alignItems: 'flex-end',
                    marginTop: '0.85rem',
                    flexWrap: 'wrap'
                  }}
                >
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        color: '#334155',
                        marginBottom: 4
                      }}
                    >
                      CORREO ELECTRÓNICO *
                    </label>
                    <input
                      type="email"
                      required
                      className="input-control"
                      placeholder="socio@email.com"
                      value={alumnoForm.correo}
                      onChange={(e) => setAlumnoForm({ ...alumnoForm, correo: e.target.value })}
                    />
                  </div>

                  <button type="submit" className="btn btn-primary">
                    <Plus size={16} />
                    {editingAlumnoId ? 'Guardar Cambios del Socio' : 'Agregar Socio a la Sede'}
                  </button>
                </div>
              </form>
            </div>

            {/* Tabla de Alumnos */}
            <div className="panel-card">
              <div
                className="panel-header light"
                style={{ flexWrap: 'wrap', gap: '0.75rem', padding: '0.75rem 1.25rem' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                  <Search size={16} color="#64748b" />
                  <input
                    type="text"
                    className="input-control"
                    style={{ maxWidth: 340 }}
                    placeholder="Buscar socio en esta sede..."
                    value={searchAlumno}
                    onChange={(e) => setSearchAlumno(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                  <select
                    className="select-control"
                    style={{ width: 'auto' }}
                    value={filterPlan}
                    onChange={(e) => setFilterPlan(e.target.value)}
                  >
                    <option value="TODOS">Todos los Planes</option>
                    {PLANES_ENTRENAMIENTO.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>

                  <select
                    className="select-control"
                    style={{ width: 'auto' }}
                    value={filterDias}
                    onChange={(e) => setFilterDias(e.target.value)}
                  >
                    <option value="TODOS">Todas las Frecuencias</option>
                    <option value="2">2 días / sem</option>
                    <option value="3">3 días / sem</option>
                    <option value="5">5 días / sem</option>
                  </select>
                </div>
              </div>

              <div className="table-scroll">
                <table className="sheet-table">
                  <thead>
                    <tr>
                      <th className="center">#</th>
                      <th>Nombre Completo</th>
                      <th>Teléfono</th>
                      <th className="right">Edad</th>
                      <th className="center">Días/Sem</th>
                      <th>Plan de Entrenamiento</th>
                      <th className="center">[Lunes]</th>
                      <th className="center">[Martes]</th>
                      <th className="center">[Miércoles]</th>
                      <th className="center">[Jueves]</th>
                      <th className="center">[Viernes]</th>
                      <th>Correo Electrónico</th>
                      <th className="center">Fecha Inscripción</th>
                      <th className="center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAlumnos.length === 0 ? (
                      <tr>
                        <td colSpan={14} className="center" style={{ padding: '2rem' }}>
                          No se encontraron socios en {currentTenant.nombre}.
                        </td>
                      </tr>
                    ) : (
                      filteredAlumnos.map((alu, idx) => (
                        <tr key={alu.id}>
                          <td className="row-index-cell">{idx + 2}</td>
                          <td style={{ fontWeight: 700, color: '#064e3b' }}>{alu.nombreCompleto}</td>
                          <td className="mono">{alu.telefono}</td>
                          <td className="right mono">{alu.edad}</td>
                          <td className="center">
                            <span className="badge badge-emerald">{alu.diasPorSemana} días</span>
                          </td>
                          <td>
                            <span className="badge badge-slate">{alu.planEntrenamiento}</span>
                          </td>
                          {DIAS_SEMANA.map((d) => (
                            <td key={d.key} className="center">
                              {alu[d.key] ? (
                                <span className="slot-pill">{alu[d.key]}</span>
                              ) : (
                                <span className="slot-empty">—</span>
                              )}
                            </td>
                          ))}
                          <td style={{ fontSize: '0.8rem', color: '#475569' }}>{alu.correo}</td>
                          <td className="center mono" style={{ fontSize: '0.78rem' }}>
                            {alu.fechaInscripcion}
                          </td>
                          <td className="center">
                            <div
                              style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}
                            >
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ padding: '0.28rem 0.55rem', fontSize: '0.75rem' }}
                                onClick={() => handleEditAlumno(alu)}
                                title="Editar socio"
                              >
                                <Edit3 size={13} />
                              </button>
                              <button
                                type="button"
                                className="btn btn-danger-soft"
                                onClick={() => handleDeleteAlumno(alu)}
                                title="Eliminar socio"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ==================== HOJA 2: TURNOS Y CUPOS ==================== */}
        {activeSheet === 'Turnos' && (
          <div>
            <div className="section-header-card">
              <div className="section-title-group">
                <h2>
                  <CalendarClock size={22} color="#047857" /> Hoja "Turnos y Cupos" —{' '}
                  {currentTenant.nombre}
                </h2>
                <p>
                  Matriz de disponibilidad de Lunes a Viernes para{' '}
                  <strong>{currentTenant.nombre}</strong>. Haz clic en cualquier turno para ver los
                  socios inscriptos.
                </p>
              </div>

              <form
                onSubmit={handleSaveConfig}
                style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}
              >
                <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#064e3b' }}>
                  CUPO MÁXIMO ({currentTenant.nombre}):
                </label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  className="input-control mono"
                  style={{ width: 82 }}
                  value={cupoInput}
                  onChange={(e) => setCupoInput(e.target.value)}
                />
                <button type="submit" className="btn btn-primary">
                  Actualizar Cupo
                </button>
              </form>
            </div>

            <div className="panel-card">
              <div className="panel-header">
                <h3>
                  <Clock size={16} /> Tabla Matriz de Disponibilidad y Cupos — {currentTenant.nombre}
                </h3>
                <span style={{ fontSize: '0.76rem', color: '#a7f3d0' }}>
                  Disponibles = Cupo Máximo ({cupoMaximo}) - Inscriptos
                </span>
              </div>

              <div className="table-scroll">
                <table className="sheet-table">
                  <thead>
                    <tr>
                      <th className="center">#</th>
                      <th>Franja Horaria</th>
                      <th className="center">Cupo Máximo</th>
                      {DIAS_SEMANA.map((d) => (
                        <th key={d.key} className="center">
                          {d.label} (Insc. / Disp.)
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {FRANJAS_HORARIAS.map((hora, idx) => (
                      <tr key={hora}>
                        <td className="row-index-cell">{idx + 2}</td>
                        <td className="mono" style={{ fontWeight: 700, color: '#064e3b' }}>
                          {hora} hs
                        </td>
                        <td className="center mono" style={{ fontWeight: 600 }}>
                          {cupoMaximo}
                        </td>
                        {DIAS_SEMANA.map((d) => {
                          const cell = turnosMatrix[hora][d.key];
                          const isSelected = selectedDia === d.key && selectedHorario === hora;
                          let badgeClass = 'badge-emerald';
                          if (cell.disponibles === 0) badgeClass = 'badge-red';
                          else if (cell.disponibles <= 3) badgeClass = 'badge-amber';

                          return (
                            <td
                              key={d.key}
                              className={`matrix-cell ${isSelected ? 'selected' : ''}`}
                              onClick={() => {
                                setSelectedDia(d.key);
                                setSelectedHorario(hora);
                              }}
                            >
                              <div className="matrix-slot-box">
                                <span
                                  className="mono"
                                  style={{ fontSize: '0.78rem', fontWeight: 600 }}
                                >
                                  Insc: <strong>{cell.count}</strong>
                                </span>
                                <span className={`badge ${badgeClass} mono`}>
                                  Disp: {cell.disponibles}
                                </span>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Módulo Interactivo de Consulta de Turno */}
            <div className="panel-card">
              <div className="panel-header">
                <h3>
                  <Search size={16} /> Módulo Interactivo de Consulta de Turno ({currentTenant.nombre}
                  )
                </h3>
              </div>

              <div className="panel-body">
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '1rem',
                    marginBottom: '1.25rem',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        color: '#334155',
                        marginBottom: 4
                      }}
                    >
                      SELECCIONAR DÍA
                    </label>
                    <select
                      className="select-control"
                      value={selectedDia}
                      onChange={(e) => setSelectedDia(e.target.value)}
                    >
                      {DIAS_SEMANA.map((d) => (
                        <option key={d.key} value={d.key}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        color: '#334155',
                        marginBottom: 4
                      }}
                    >
                      SELECCIONAR HORARIO
                    </label>
                    <select
                      className="select-control mono"
                      value={selectedHorario}
                      onChange={(e) => setSelectedHorario(e.target.value)}
                    >
                      {FRANJAS_HORARIAS.map((h) => (
                        <option key={h} value={h}>
                          {h} hs
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="kpi-card emerald-dark" style={{ padding: '0.85rem 1.1rem' }}>
                    <div className="kpi-label">TOTAL INSCRIPTOS EN TURNO</div>
                    <div className="kpi-value">
                      {turnoSeleccionadoData.count} / {cupoMaximo}
                    </div>
                    <div className="kpi-sub">
                      {DIAS_SEMANA.find((d) => d.key === selectedDia)?.label} • {selectedHorario} hs
                    </div>
                  </div>

                  <div className="kpi-card" style={{ padding: '0.85rem 1.1rem' }}>
                    <div className="kpi-label">CUPOS DISPONIBLES</div>
                    <div className="kpi-value" style={{ color: '#047857' }}>
                      {turnoSeleccionadoData.disponibles} libres
                    </div>
                    <div className="kpi-sub">
                      Ocupación: {Math.round((turnoSeleccionadoData.count / cupoMaximo) * 100)}%
                    </div>
                  </div>
                </div>

                <div className="table-scroll">
                  <table className="sheet-table">
                    <thead>
                      <tr>
                        <th className="center">#</th>
                        <th>Nombre del Alumno Anotado</th>
                        <th>Teléfono</th>
                        <th className="right">Edad</th>
                        <th>Plan de Entrenamiento</th>
                        <th>Correo Electrónico</th>
                      </tr>
                    </thead>
                    <tbody>
                      {turnoSeleccionadoData.inscriptos.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="center" style={{ padding: '1.75rem' }}>
                            No hay alumnos anotados en este turno en {currentTenant.nombre}.
                          </td>
                        </tr>
                      ) : (
                        turnoSeleccionadoData.inscriptos.map((alu, i) => (
                          <tr key={alu.id}>
                            <td className="row-index-cell">{i + 1}</td>
                            <td style={{ fontWeight: 700, color: '#064e3b' }}>
                              {alu.nombreCompleto}
                            </td>
                            <td className="mono">{alu.telefono}</td>
                            <td className="right mono">{alu.edad} años</td>
                            <td>
                              <span className="badge badge-emerald">{alu.planEntrenamiento}</span>
                            </td>
                            <td>{alu.correo}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== HOJAS 3, 4, 5: COBRANZAS MENSUALES ==================== */}
        {MESES_COBRANZA.includes(activeSheet) &&
          (() => {
            const resumen = getResumenMes(activeSheet);
            const totalCargaPreview = Math.max(
              0,
              (Number(cobranzaForm.precioCuota) || 0) +
                (Number(cobranzaForm.descuentoInscripcion) || 0)
            );

            return (
              <div>
                <div className="section-header-card">
                  <div className="section-title-group">
                    <h2>
                      <DollarSign size={22} color="#047857" /> Cobranzas "{activeSheet}" —{' '}
                      {currentTenant.nombre}
                    </h2>
                    <p>
                      Arqueo mensual de <strong>{currentTenant.nombre}</strong> con reparto{' '}
                      <strong>{currentTenant.porcentajeProfesor}% Profesor</strong> /{' '}
                      <strong>{currentTenant.porcentajeGym}% Gimnasio</strong>.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {MESES_COBRANZA.map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={`btn ${activeSheet === m ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setActiveSheet(m)}
                      >
                        Mes: {m}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Panel de Resumen Total del Mes */}
                <div className="kpi-grid-5">
                  <div className="kpi-card emerald-dark">
                    <div className="kpi-label">
                      <span>TOTAL RECAUDADO ({activeSheet.toUpperCase()})</span>
                      <Wallet size={15} />
                    </div>
                    <div className="kpi-value">{formatCurrency(resumen.totalRecaudado)}</div>
                    <div className="kpi-sub">{resumen.pagosMes.length} cuotas en esta sede</div>
                  </div>

                  <div className="kpi-card">
                    <div className="kpi-label">SUBTOTAL EFECTIVO</div>
                    <div className="kpi-value" style={{ color: '#047857' }}>
                      {formatCurrency(resumen.subtotalEfectivo)}
                    </div>
                    <div className="kpi-sub">Caja física del mes</div>
                  </div>

                  <div className="kpi-card">
                    <div className="kpi-label">SUBTOTAL TRANSFERENCIA</div>
                    <div className="kpi-value" style={{ color: '#2563eb' }}>
                      {formatCurrency(resumen.subtotalTransferencia)}
                    </div>
                    <div className="kpi-sub">Acreditación bancaria</div>
                  </div>

                  <div className="kpi-card">
                    <div className="kpi-label">
                      LIQUIDACIÓN PROFESOR ({currentTenant.porcentajeProfesor}%)
                    </div>
                    <div className="kpi-value" style={{ color: '#d97706' }}>
                      {formatCurrency(resumen.liquidacionProfesor)}
                    </div>
                    <div className="kpi-sub">Honorarios sobre recaudación</div>
                  </div>

                  <div className="kpi-card">
                    <div className="kpi-label">
                      TOTAL NETO GIMNASIO ({currentTenant.porcentajeGym}%)
                    </div>
                    <div className="kpi-value" style={{ color: '#064e3b' }}>
                      {formatCurrency(resumen.netoGym)}
                    </div>
                    <div className="kpi-sub">Utilidad neta {currentTenant.nombre}</div>
                  </div>
                </div>

                <div className="split-grid-cobranzas">
                  {/* Formulario Superior de Carga de Cuotas */}
                  <div className="panel-card" style={{ marginBottom: 0 }}>
                    <div className="panel-header">
                      <h3>
                        <Plus size={16} /> Carga de Cuotas — {activeSheet} ({currentTenant.nombre})
                      </h3>
                      <span className="mono" style={{ fontSize: '0.78rem', color: '#a7f3d0' }}>
                        Total a cobrar: {formatCurrency(totalCargaPreview)}
                      </span>
                    </div>

                    <form
                      className="panel-body"
                      onSubmit={(e) => handleSaveCobranza(e, activeSheet)}
                    >
                      <div className="form-grid-4" style={{ marginBottom: '0.85rem' }}>
                        <div className="col-span-2">
                          <label
                            style={{
                              display: 'block',
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              color: '#334155',
                              marginBottom: 4
                            }}
                          >
                            ALUMNO DE ESTA SEDE *
                          </label>
                          <select
                            required
                            className="select-control"
                            value={cobranzaForm.alumnoId}
                            onChange={(e) => handleSelectAlumnoForCobranza(e.target.value)}
                          >
                            <option value="">— Seleccionar socio —</option>
                            {alumnos.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.nombreCompleto} ({a.diasPorSemana} días • {a.planEntrenamiento})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label
                            style={{
                              display: 'block',
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              color: '#334155',
                              marginBottom: 4
                            }}
                          >
                            DÍAS / SEMANA
                          </label>
                          <select
                            className="select-control"
                            value={cobranzaForm.dias}
                            onChange={(e) => {
                              const d = Number(e.target.value);
                              setCobranzaForm({
                                ...cobranzaForm,
                                dias: d,
                                precioCuota: getPrecioByDias(d)
                              });
                            }}
                          >
                            <option value={2}>2 días</option>
                            <option value={3}>3 días</option>
                            <option value={5}>5 días</option>
                          </select>
                        </div>

                        <div>
                          <label
                            style={{
                              display: 'block',
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              color: '#334155',
                              marginBottom: 4
                            }}
                          >
                            PRECIO CUOTA ($)
                          </label>
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
                      </div>

                      <div className="form-grid-4" style={{ marginBottom: '0.85rem' }}>
                        <div>
                          <label
                            style={{
                              display: 'block',
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              color: '#334155',
                              marginBottom: 4
                            }}
                          >
                            ACTIVIDAD / PLAN
                          </label>
                          <select
                            className="select-control"
                            value={cobranzaForm.actividad}
                            onChange={(e) =>
                              setCobranzaForm({ ...cobranzaForm, actividad: e.target.value })
                            }
                          >
                            {PLANES_ENTRENAMIENTO.map((p) => (
                              <option key={p} value={p}>
                                {p}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label
                            style={{
                              display: 'block',
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              color: '#334155',
                              marginBottom: 4
                            }}
                          >
                            MÉTODO DE PAGO
                          </label>
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
                          <label
                            style={{
                              display: 'block',
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              color: '#334155',
                              marginBottom: 4
                            }}
                          >
                            DESCUENTO (-) / INSCRIPCIÓN (+)
                          </label>
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

                        <div>
                          <label
                            style={{
                              display: 'block',
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              color: '#334155',
                              marginBottom: 4
                            }}
                          >
                            FECHA DE PAGO
                          </label>
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

                      <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-end' }}>
                        <div style={{ flex: 1 }}>
                          <label
                            style={{
                              display: 'block',
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              color: '#334155',
                              marginBottom: 4
                            }}
                          >
                            OBSERVACIONES
                          </label>
                          <input
                            type="text"
                            className="input-control"
                            placeholder="Observaciones del pago..."
                            value={cobranzaForm.observaciones}
                            onChange={(e) =>
                              setCobranzaForm({ ...cobranzaForm, observaciones: e.target.value })
                            }
                          />
                        </div>
                        <button type="submit" className="btn btn-primary">
                          <Plus size={16} /> Registrar Pago
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Panel de Configuración de Tarifas */}
                  <div className="panel-card" style={{ marginBottom: 0 }}>
                    <div className="panel-header">
                      <h3>
                        <DollarSign size={16} /> Configuración de Tarifas ({currentTenant.nombre})
                      </h3>
                    </div>

                    <form className="panel-body" onSubmit={handleSaveConfig}>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr 1fr',
                          gap: '0.65rem',
                          marginBottom: '0.85rem'
                        }}
                      >
                        <div>
                          <label
                            style={{
                              display: 'block',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              color: '#334155',
                              marginBottom: 4
                            }}
                          >
                            TARIFA 2 DÍAS
                          </label>
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
                          <label
                            style={{
                              display: 'block',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              color: '#334155',
                              marginBottom: 4
                            }}
                          >
                            TARIFA 3 DÍAS
                          </label>
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
                          <label
                            style={{
                              display: 'block',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              color: '#334155',
                              marginBottom: 4
                            }}
                          >
                            TARIFA 5 DÍAS
                          </label>
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

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: '0.65rem',
                          marginBottom: '0.9rem'
                        }}
                      >
                        <div>
                          <label
                            style={{
                              display: 'block',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              color: '#065f46',
                              marginBottom: 4
                            }}
                          >
                            % REPARTO PROFESOR
                          </label>
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
                          <label
                            style={{
                              display: 'block',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              color: '#065f46',
                              marginBottom: 4
                            }}
                          >
                            % REPARTO GIMNASIO
                          </label>
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

                      <button type="submit" className="btn btn-emerald-soft btn-full">
                        Guardar Tarifas de {currentTenant.nombre}
                      </button>
                    </form>
                  </div>
                </div>

                {/* Tabla Histórica Mensual */}
                <div className="panel-card">
                  <div className="panel-header">
                    <h3>
                      Detalle Histórico de Pagos — {activeSheet} ({currentTenant.nombre})
                    </h3>
                    <span className="mono" style={{ fontSize: '0.78rem', color: '#a7f3d0' }}>
                      Total Mes: {formatCurrency(resumen.totalRecaudado)}
                    </span>
                  </div>

                  <div className="table-scroll">
                    <table className="sheet-table">
                      <thead>
                        <tr>
                          <th className="center">#</th>
                          <th>Alumno</th>
                          <th className="center">Frecuencia</th>
                          <th>Actividad</th>
                          <th className="right">Precio Cuota</th>
                          <th className="right">Desc. / Inscripción</th>
                          <th className="right">Total Abonado</th>
                          <th className="center">Método de Pago</th>
                          <th className="center">Fecha</th>
                          <th>Observaciones</th>
                          <th className="center">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resumen.pagosMes.length === 0 ? (
                          <tr>
                            <td colSpan={11} className="center" style={{ padding: '2rem' }}>
                              No hay pagos registrados en {activeSheet} para {currentTenant.nombre}.
                            </td>
                          </tr>
                        ) : (
                          resumen.pagosMes.map((cob, i) => (
                            <tr key={cob.id}>
                              <td className="row-index-cell">{i + 2}</td>
                              <td style={{ fontWeight: 700, color: '#064e3b' }}>
                                {cob.alumnoNombre}
                              </td>
                              <td className="center">
                                <span className="badge badge-slate">{cob.dias} días</span>
                              </td>
                              <td>{cob.actividad}</td>
                              <td className="right mono">{formatCurrency(cob.precioCuota)}</td>
                              <td className="right mono">
                                {cob.descuentoInscripcion === 0
                                  ? '—'
                                  : cob.descuentoInscripcion > 0
                                  ? `+${formatCurrency(cob.descuentoInscripcion)}`
                                  : formatCurrency(cob.descuentoInscripcion)}
                              </td>
                              <td
                                className="right mono"
                                style={{ fontWeight: 800, color: '#064e3b' }}
                              >
                                {formatCurrency(cob.totalPagado)}
                              </td>
                              <td className="center">
                                <span
                                  className={`badge ${
                                    cob.metodoPago === 'Efectivo' ? 'badge-emerald' : 'badge-blue'
                                  }`}
                                >
                                  {cob.metodoPago}
                                </span>
                              </td>
                              <td className="center mono" style={{ fontSize: '0.78rem' }}>
                                {cob.fechaPago}
                              </td>
                              <td style={{ fontSize: '0.8rem', color: '#475569' }}>
                                {cob.observaciones}
                              </td>
                              <td className="center">
                                <button
                                  type="button"
                                  className="btn btn-danger-soft"
                                  onClick={() => handleDeleteCobranza(cob)}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })()}

        {/* ==================== HOJA 4: DASHBOARD DE LA SEDE ==================== */}
        {activeSheet === 'Dashboard' && (
          <div>
            <div className="section-header-card">
              <div className="section-title-group">
                <h2>
                  <BarChart3 size={22} color="#047857" /> Hoja "Dashboard" — KPIs de{' '}
                  {currentTenant.nombre}
                </h2>
                <p>
                  Métricas operativas, demográficas y financieras en tiempo real para{' '}
                  <strong>{currentTenant.nombre}</strong> ({currentTenant.sede}).
                </p>
              </div>
            </div>

            <div className="kpi-grid-4">
              <div className="kpi-card emerald-dark">
                <div className="kpi-label">
                  <span>ALUMNOS ACTIVOS EN SEDE</span>
                  <Users size={16} />
                </div>
                <div className="kpi-value">{dashboardStats.totalAlumnosActivos} socios</div>
                <div className="kpi-sub">
                  {dashboardStats.totalAsistenciasSemanales} turnos semanales reservados
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-label">
                  <span>RECAUDACIÓN TRIMESTRE (OCT-DIC)</span>
                  <TrendingUp size={16} color="#059669" />
                </div>
                <div className="kpi-value" style={{ color: '#047857' }}>
                  {formatCurrency(dashboardStats.totalRecaudadoAnual)}
                </div>
                <div className="kpi-sub">
                  Oct: {formatCurrency(getResumenMes('Octubre').totalRecaudado)} • Nov:{' '}
                  {formatCurrency(getResumenMes('Noviembre').totalRecaudado)} • Dic:{' '}
                  {formatCurrency(getResumenMes('Diciembre').totalRecaudado)}
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-label">
                  <span>OCUPACIÓN GLOBAL DE AFORO</span>
                  <CalendarClock size={16} color="#059669" />
                </div>
                <div className="kpi-value">{dashboardStats.ocupacionGlobalPct}%</div>
                <div className="kpi-sub">
                  {dashboardStats.totalAsistenciasSemanales} de{' '}
                  {dashboardStats.capacidadSemanalTotal} cupos semanales
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-label">
                  <span>
                    REPARTO SEDE ({currentTenant.porcentajeProfesor}% /{' '}
                    {currentTenant.porcentajeGym}%)
                  </span>
                  <DollarSign size={16} color="#d97706" />
                </div>
                <div className="kpi-value" style={{ fontSize: '1.3rem', color: '#064e3b' }}>
                  Gym:{' '}
                  {formatCurrency(
                    Math.round(
                      (dashboardStats.totalRecaudadoAnual * currentTenant.porcentajeGym) / 100
                    )
                  )}
                </div>
                <div className="kpi-sub">
                  Profesor ({currentTenant.porcentajeProfesor}%):{' '}
                  {formatCurrency(
                    Math.round(
                      (dashboardStats.totalRecaudadoAnual * currentTenant.porcentajeProfesor) / 100
                    )
                  )}
                </div>
              </div>
            </div>

            <div className="split-grid-2">
              <div className="panel-card" style={{ marginBottom: 0 }}>
                <div className="panel-header">
                  <h3>Desglose por Modalidad de Entrenamiento</h3>
                </div>
                <div className="panel-body">
                  {dashboardStats.porModalidad.map((item) => (
                    <div key={item.plan} className="bar-row">
                      <div className="bar-row-header">
                        <span>{item.plan}</span>
                        <span className="mono">
                          {item.count} socios ({item.pct}%) • {formatCurrency(item.ingresosPlan)}
                        </span>
                      </div>
                      <div className="bar-track">
                        <div className="bar-fill" style={{ width: `${Math.max(4, item.pct)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel-card" style={{ marginBottom: 0 }}>
                <div className="panel-header">
                  <h3>Distribución Demográfica por Rango de Edad</h3>
                </div>
                <div className="panel-body">
                  {dashboardStats.rangosEdad.map((r) => (
                    <div key={r.label} className="bar-row">
                      <div className="bar-row-header">
                        <span>{r.label}</span>
                        <span className="mono">
                          {r.count} alumnos ({r.pct}%)
                        </span>
                      </div>
                      <div className="bar-track">
                        <div className="bar-fill" style={{ width: `${Math.max(4, r.pct)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="split-grid-2">
              <div className="panel-card" style={{ marginBottom: 0 }}>
                <div className="panel-header">
                  <h3>Ocupación por Franja Horaria vs. Cupo Máximo Semanal</h3>
                  <span style={{ fontSize: '0.75rem', color: '#a7f3d0' }}>
                    Capacidad Lun-Vie por hora: {cupoMaximo * 5} cupos
                  </span>
                </div>
                <div className="panel-body">
                  {dashboardStats.ocupacionPorFranja.map((f) => {
                    let fillClass = '';
                    if (f.pct >= 80) fillClass = 'red';
                    else if (f.pct >= 50) fillClass = 'amber';
                    return (
                      <div key={f.hora} className="bar-row">
                        <div className="bar-row-header">
                          <span className="mono">Turno {f.hora} hs</span>
                          <span className="mono">
                            {f.inscriptosFranja} / {f.capMaxFranjaSemanal} cupos ({f.pct}%)
                          </span>
                        </div>
                        <div className="bar-track">
                          <div
                            className={`bar-fill ${fillClass}`}
                            style={{ width: `${Math.min(100, Math.max(3, f.pct))}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="panel-card" style={{ marginBottom: 0 }}>
                <div className="panel-header">
                  <h3>Distribución Porcentual de Asistencia por Día de la Semana</h3>
                </div>
                <div className="panel-body">
                  {dashboardStats.distribucionDias.map((d) => (
                    <div key={d.key} className="bar-row">
                      <div className="bar-row-header">
                        <span>{d.label}</span>
                        <span className="mono">
                          {d.count} asistencias ({d.pct}% del total semanal)
                        </span>
                      </div>
                      <div className="bar-track">
                        <div
                          className="bar-fill"
                          style={{ width: `${Math.min(100, Math.max(4, d.pct * 2.5))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
