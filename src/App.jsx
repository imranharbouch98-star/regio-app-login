import { useEffect, useLayoutEffect, useMemo, useState, useRef } from "react";
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Marker, Tooltip, ZoomControl, Pane, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";
import Login from "./Login.jsx";
import { firebaseEnabled, subscribeToOverrides, saveOverridesShared, subscribeToAdminAuth, adminSignOut } from "./firebase.js";
import avatarMale from "./assets/avatar-male.png";
import avatarFemale from "./assets/avatar-female.png";

import advisorPostcodesBase from "./data/advisor-postcodes.json";
import advisorsHome from "./data/advisors-home.json";
import postcodeNames from "./data/postcode-names.json";
import notesData from "./data/notes.json";
import advisorTagsBase from "./data/advisor-tags.json";

import advisorPostcodesAlkmaar from "./data/advisor-postcodes-alkmaar.json";
import advisorsHomeAlkmaar from "./data/advisors-home-alkmaar.json";
import postcodeNamesAlkmaar from "./data/postcode-names-alkmaar.json";
import notesDataAlkmaar from "./data/notes-alkmaar.json";

const AUTH_KEY = "map-auth-ok";
const ROLE_KEY = "map-auth-role";

const COLORS = [
  "#D85A30", "#378ADD", "#639922", "#7F77DD", "#D4537E",
  "#BA7517", "#1D9E75", "#888780", "#e24b4a", "#0c447c",
];

const SEARCH_COLORS = ["#EF9F27", "#3B8BD4", "#639922", "#D4537E", "#8B5CF6", "#0c447c"];
const MAX_SEARCH_FIELDS = SEARCH_COLORS.length;

const VLAANDEREN_TAG_DEFS = [
  { id: "prio", emoji: "👑", label: "Prioriteit", bold: true },
  { id: "airco", emoji: "🌬️", label: "Airco" },
  { id: "zp", emoji: "☀️", label: "Zonnepanelen" },
  { id: "wpb", emoji: "💧", label: "Warmtepompboiler" },
  { id: "wplw", emoji: "🔥", label: "Warmtepomp lucht-water" },
];

const PRODUCT_DEFS = [
  { id: "airco", emoji: "🌬️", label: "Airco" },
  { id: "zp", emoji: "☀️", label: "Zonnepanelen" },
  { id: "thuisbatterij", emoji: "🔋", label: "Thuisbatterij" },
  { id: "wplw", emoji: "🔥", label: "Lucht-Water warmtepomp" },
  { id: "wpb", emoji: "💧", label: "Warmtepompboiler" },
];

const LANGUAGE_DEFS = ["FR", "NL", "ENG"];

const GENDER_AVATARS = { m: avatarMale, v: avatarFemale };

const ONLINE_OFFERTE_LABELS = { ja: "👍 Ja!", nee: "👎 Nee!", eigen_klant: "Enkel eigen klant" };

function ProfileAvatar({ gender }) {
  const src = GENDER_AVATARS[gender];
  if (!src) return <span>👤</span>;
  return <img src={src} alt="" className="profile-photo-img" />;
}

function emptyProfile() {
  return {
    gender: "",
    tier: "",
    products: [],
    onlineOfferte: "",
    languages: [],
    languagesExtra: "",
    thuisbatterijEnkel: "",
    homeBasePostcode: "",
    homeBaseCity: "",
    travelRadiusMin: "",
    extraInfo: "",
  };
}

// elk departement is volledig apart: eigen kaartdata, eigen adviseurs, eigen
// opslag-sleutel. Ze delen geen data en botsen dus nooit met elkaar.
const DEPARTMENTS = [
  {
    id: "vlaanderen",
    label: "Vlaanderen & Zuid-NL",
    postcodesUrl: "/data/postcodes.geojson",
    advisorPostcodesBase,
    advisorsHome,
    postcodeNames,
    notesSeed: notesData,
    notesStorageKey: "advisor-notes",
    notesFirebasePath: "advisorNotes",
    storageKey: "advisor-postcode-overrides",
    firebasePath: "advisorPostcodeOverrides",
    center: [50.95, 4.6],
    zoom: 8,
    tagDefs: VLAANDEREN_TAG_DEFS,
    advisorTagsBase,
    tagsStorageKey: "advisor-tag-overrides",
    tagsFirebasePath: "advisorTagOverrides",
    deletedStorageKey: "advisor-deleted-overrides",
    deletedFirebasePath: "advisorDeletedOverrides",
    profilesStorageKey: "advisor-profiles",
    profilesFirebasePath: "advisorProfiles",
  },
  {
    id: "alkmaar",
    label: "Alkmaar",
    postcodesUrl: "/data/postcodes-alkmaar.geojson",
    advisorPostcodesBase: advisorPostcodesAlkmaar,
    advisorsHome: advisorsHomeAlkmaar,
    postcodeNames: postcodeNamesAlkmaar,
    notesSeed: notesDataAlkmaar,
    notesStorageKey: "advisor-notes-alkmaar",
    notesFirebasePath: "advisorNotesAlkmaar",
    storageKey: "advisor-postcode-overrides-alkmaar",
    firebasePath: "advisorPostcodeOverridesAlkmaar",
    center: [52.6, 5.0],
    zoom: 8,
    tagDefs: [],
    advisorTagsBase: {},
    tagsStorageKey: "advisor-tag-overrides-alkmaar",
    tagsFirebasePath: "advisorTagOverridesAlkmaar",
    deletedStorageKey: "advisor-deleted-overrides-alkmaar",
    deletedFirebasePath: "advisorDeletedOverridesAlkmaar",
    profilesStorageKey: "advisor-profiles-alkmaar",
    profilesFirebasePath: "advisorProfilesAlkmaar",
  },
];

function colorForIndex(i) {
  return COLORS[i % COLORS.length];
}

function loadOverrides(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveOverridesLocal(key, overrides) {
  localStorage.setItem(key, JSON.stringify(overrides));
}

// bundled notes.json entries only have a free-text "text" field (e.g. "Maarten 16/09");
// this pulls out just the name so it isn't duplicated once we render "name + date" ourselves
function migrateSeedNotes(seed) {
  return (seed || []).map((n, i) => ({
    id: `seed-${i}-${n.postcode}`,
    postcode: n.postcode,
    name: (n.text || "").replace(/\s+\d{1,2}\/\d{1,2}.*$/, "").trim() || n.text || "Notitie",
    expires: n.expires,
  }));
}

function shortDate(iso) {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// same name + same postcode -> one sticky-note line with dates joined by "en"
// (e.g. "Roderik 06/10 en 07/10"), instead of a separate line per note
function groupNotesByName(list) {
  const map = new Map();
  list.forEach((n) => {
    if (!map.has(n.name)) map.set(n.name, new Set());
    map.get(n.name).add(n.expires);
  });
  return Array.from(map.entries()).map(([name, dates]) => ({
    name,
    dates: Array.from(dates).sort(),
  }));
}

function centroidOfRing(ring) {
  let sx = 0, sy = 0;
  ring.forEach(([x, y]) => { sx += x; sy += y; });
  return [sy / ring.length, sx / ring.length];
}

function MapEvents({ onZoom, onBounds }) {
  const map = useMapEvents({
    zoomend: () => onZoom(map.getZoom()),
    moveend: () => onBounds(map.getBounds()),
  });
  useEffect(() => {
    onBounds(map.getBounds());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export default function App() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(AUTH_KEY) === "1");
  const [role, setRole] = useState(() => sessionStorage.getItem(ROLE_KEY) || "viewer");
  const [fbAdminAuthed, setFbAdminAuthed] = useState(false);
  const [activeDept, setActiveDept] = useState(DEPARTMENTS[0].id);

  useEffect(() => {
    return subscribeToAdminAuth(setFbAdminAuthed);
  }, []);

  if (!authed) {
    return (
      <Login
        onSuccess={(r) => {
          sessionStorage.setItem(AUTH_KEY, "1");
          sessionStorage.setItem(ROLE_KEY, r);
          setRole(r);
          setAuthed(true);
        }}
      />
    );
  }

  const dept = DEPARTMENTS.find((d) => d.id === activeDept);
  // admin UI/writes require a real Firebase-authenticated session when
  // Firebase is configured -- sessionStorage alone can be faked from
  // devtools, so it's no longer the actual security boundary
  const isAdmin = role === "admin" && (!firebaseEnabled || fbAdminAuthed);

  function handleLogout() {
    sessionStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem(ROLE_KEY);
    adminSignOut();
    setRole("viewer");
    setAuthed(false);
  }

  return (
    <div className="app-shell">
      <div className="dept-tabs">
        {DEPARTMENTS.map((d) => (
          <button
            key={d.id}
            className={d.id === activeDept ? "dept-tab active" : "dept-tab"}
            onClick={() => setActiveDept(d.id)}
          >
            {d.label}
          </button>
        ))}
        <button className="logout-btn" onClick={handleLogout}>Uitloggen</button>
      </div>
      <DeptMap key={dept.id} config={dept} isAdmin={isAdmin} />
    </div>
  );
}

function DeptMap({ config, isAdmin }) {
  const {
    postcodesUrl, advisorPostcodesBase, advisorsHome, postcodeNames,
    storageKey, firebasePath, center, zoom: initialZoom,
    notesSeed, notesStorageKey, notesFirebasePath,
    tagDefs, advisorTagsBase, tagsStorageKey, tagsFirebasePath,
    deletedStorageKey, deletedFirebasePath,
    profilesStorageKey, profilesFirebasePath,
  } = config;

  const [postcodesGeo, setPostcodesGeo] = useState(null);
  const [selected, setSelected] = useState(null);
  const [overrides, setOverrides] = useState(() => loadOverrides(storageKey));
  const [tagOverrides, setTagOverrides] = useState(() => loadOverrides(tagsStorageKey));
  const [deletedAdvisors, setDeletedAdvisors] = useState(() => loadOverrides(deletedStorageKey));
  const [profiles, setProfiles] = useState(() => loadOverrides(profilesStorageKey));
  const [notesList, setNotesList] = useState(() => {
    try {
      const raw = localStorage.getItem(notesStorageKey);
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore malformed local data, fall back to seed below
    }
    return migrateSeedNotes(notesSeed);
  });
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(false);
  const [zoom, setZoom] = useState(initialZoom);
  const [mapBounds, setMapBounds] = useState(null);
  const [searchFields, setSearchFields] = useState(["", ""]);
  const [activeSearch, setActiveSearch] = useState([]);
  const [searchError, setSearchError] = useState("");
  const [panelAdvisor, setPanelAdvisor] = useState(null);
  const [panelTop, setPanelTop] = useState(80);
  const [panelLeft, setPanelLeft] = useState(276);
  const [panelPcDraft, setPanelPcDraft] = useState("");
  const [panelTags, setPanelTags] = useState([]);
  const [panelSaved, setPanelSaved] = useState(false);
  const [notesPanelOpen, setNotesPanelOpen] = useState(false);
  const [noteDraftPostcode, setNoteDraftPostcode] = useState("");
  const [noteDraftName, setNoteDraftName] = useState("");
  const [noteDraftDate, setNoteDraftDate] = useState("");
  const [noteError, setNoteError] = useState("");
  const [profileViewName, setProfileViewName] = useState(null);
  const [profileDraft, setProfileDraft] = useState(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [newAdvisorName, setNewAdvisorName] = useState("");
  const [addAdvisorError, setAddAdvisorError] = useState("");
  const [toast, setToast] = useState("");
  const mapRef = useRef(null);
  const canvasRenderer = useMemo(() => L.canvas(), []);
  const advisorLayerRef = useRef(null);
  const panelRef = useRef(null);
  const notesSeededRef = useRef(false);
  const toastTimeoutRef = useRef(null);
  const productsMigratedRef = useRef(false);
  const handlePostcodeClickRef = useRef(() => {});
  const activePopupRef = useRef(null);

  useEffect(() => {
    if (firebaseEnabled) {
      const unsubscribe = subscribeToOverrides(firebasePath, (shared) => setOverrides(shared));
      return unsubscribe;
    }
  }, [firebasePath]);

  useEffect(() => {
    if (firebaseEnabled) {
      const unsubscribe = subscribeToOverrides(tagsFirebasePath, (shared) => setTagOverrides(shared));
      return unsubscribe;
    }
  }, [tagsFirebasePath]);

  useEffect(() => {
    if (firebaseEnabled) {
      const unsubscribe = subscribeToOverrides(deletedFirebasePath, (shared) => setDeletedAdvisors(shared));
      return unsubscribe;
    }
  }, [deletedFirebasePath]);

  // one-time backfill: copy each advisor's original product tags into their
  // profile, since the profile used to be a separate, empty data store
  function backfillProductsFromTags(currentProfiles) {
    const productIds = PRODUCT_DEFS.map((p) => p.id);
    let changed = false;
    const next = { ...currentProfiles };
    Object.keys(advisorTagsBase).forEach((name) => {
      const existing = next[name];
      if (existing && existing.products && existing.products.length > 0) return;
      const seedTags = advisorTagsBase[name] || [];
      const products = productIds.filter((id) => seedTags.includes(id));
      if (products.length === 0) return;
      next[name] = { ...emptyProfile(), ...(existing || {}), products };
      changed = true;
    });
    return changed ? next : null;
  }

  useEffect(() => {
    if (firebaseEnabled) {
      const unsubscribe = subscribeToOverrides(profilesFirebasePath, (shared) => {
        setProfiles(shared);
        if (!productsMigratedRef.current) {
          productsMigratedRef.current = true;
          const migrated = backfillProductsFromTags(shared);
          if (migrated) {
            setProfiles(migrated);
            saveOverridesShared(profilesFirebasePath, migrated);
          }
        }
      });
      return unsubscribe;
    }
    if (!productsMigratedRef.current) {
      productsMigratedRef.current = true;
      const migrated = backfillProductsFromTags(profiles);
      if (migrated) {
        setProfiles(migrated);
        saveOverridesLocal(profilesStorageKey, migrated);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profilesFirebasePath]);

  useEffect(() => {
    if (!firebaseEnabled) return;
    const unsubscribe = subscribeToOverrides(notesFirebasePath, (shared) => {
      const arr = Array.isArray(shared) ? shared : shared && typeof shared === "object" ? Object.values(shared) : null;
      if (arr && arr.length > 0) {
        notesSeededRef.current = true;
        setNotesList(arr);
      } else if (!notesSeededRef.current) {
        // nothing shared yet -- seed Firebase once from the bundled notes.json
        notesSeededRef.current = true;
        const migrated = migrateSeedNotes(notesSeed);
        setNotesList(migrated);
        saveOverridesShared(notesFirebasePath, migrated);
      } else {
        setNotesList([]);
      }
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notesFirebasePath]);

  useEffect(() => {
    if (!panelAdvisor) return;
    const onKeyDown = (e) => { if (e.key === "Escape") setPanelAdvisor(null); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [panelAdvisor]);

  useEffect(() => {
    if (!profileViewName) return;
    const onKeyDown = (e) => { if (e.key === "Escape") closeProfile(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileViewName]);

  const advisorPostcodes = useMemo(() => {
    return { ...advisorPostcodesBase, ...overrides };
  }, [advisorPostcodesBase, overrides]);

  const advisorTags = useMemo(() => {
    return { ...advisorTagsBase, ...tagOverrides };
  }, [advisorTagsBase, tagOverrides]);

  const advisorNames = useMemo(
    () => Object.keys(advisorPostcodes).filter((n) => !deletedAdvisors[n]).sort((a, b) => a.localeCompare(b)),
    [advisorPostcodes, deletedAdvisors]
  );

  useEffect(() => {
    fetch(postcodesUrl)
      .then((r) => r.json())
      .then((geo) => {
        geo.features = geo.features.filter((f) => f && f.geometry);
        setPostcodesGeo(geo);
      });
  }, [postcodesUrl]);

  const postcodeToCentroid = useMemo(() => {
    if (!postcodesGeo) return {};
    const sums = {};
    postcodesGeo.features.forEach((f) => {
      const pc = f.properties.postcode;
      const rings = f.geometry.type === "Polygon" ? [f.geometry.coordinates[0]] : f.geometry.coordinates.map((p) => p[0]);
      rings.forEach((ring) => {
        const [lat, lng] = centroidOfRing(ring);
        if (!sums[pc]) sums[pc] = { lat: 0, lng: 0, n: 0 };
        sums[pc].lat += lat;
        sums[pc].lng += lng;
        sums[pc].n += 1;
      });
    });
    const out = {};
    Object.entries(sums).forEach(([pc, s]) => { out[pc] = [s.lat / s.n, s.lng / s.n]; });
    return out;
  }, [postcodesGeo]);

  const availablePostcodes = useMemo(() => new Set(Object.keys(postcodeToCentroid)), [postcodeToCentroid]);

  const homeCoords = useMemo(() => {
    const coords = {};
    Object.entries(advisorsHome).forEach(([name, info]) => {
      if (deletedAdvisors[name]) return;
      if (postcodeToCentroid[info.postcode]) coords[name] = postcodeToCentroid[info.postcode];
    });
    return coords;
  }, [postcodeToCentroid, advisorsHome, deletedAdvisors]);

  const zoneLabels = useMemo(() => {
    const groups = {};
    Object.entries(postcodeToCentroid).forEach(([pc, c]) => {
      const zoneKey = pc.slice(0, 2);
      if (!groups[zoneKey]) groups[zoneKey] = [];
      groups[zoneKey].push(c);
    });
    return Object.entries(groups).map(([zoneKey, pts]) => {
      const lat = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const lng = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      return { zone: zoneKey, lat, lng };
    });
  }, [postcodeToCentroid]);

  const postcodeLabels = useMemo(() => {
    return Object.entries(postcodeToCentroid).map(([pc, c]) => ({ pc, lat: c[0], lng: c[1] }));
  }, [postcodeToCentroid]);

  // only the postcodes near the current viewport get their own label layer --
  // rendering all ~1000+ nationwide on every zoom-in is what caused the lag
  const visiblePostcodeLabels = useMemo(() => {
    if (!mapBounds) return postcodeLabels;
    const padded = mapBounds.pad(0.25);
    return postcodeLabels.filter(({ lat, lng }) => padded.contains([lat, lng]));
  }, [postcodeLabels, mapBounds]);

  const activeNotes = useMemo(() => {
    const today = new Date();
    return (notesList || []).filter((n) => new Date(n.expires) >= today);
  }, [notesList]);

  const notesByPostcode = useMemo(() => {
    const groups = {};
    activeNotes.forEach((n) => {
      if (!groups[n.postcode]) groups[n.postcode] = [];
      groups[n.postcode].push(n);
    });
    return groups;
  }, [activeNotes]);

  const showPostcodeLabels = zoom >= 10;

  const selectedPostcodeSet = useMemo(() => {
    if (!selected) return null;
    return new Set(advisorPostcodes[selected] || []);
  }, [selected, advisorPostcodes]);

  const colorIndex = selected ? advisorNames.indexOf(selected) : 0;
  const highlightColor = colorForIndex(colorIndex);

  const searchByPostcode = useMemo(() => {
    const m = new Map();
    activeSearch.forEach((s) => {
      if (!m.has(s.postcode)) m.set(s.postcode, s);
    });
    return m;
  }, [activeSearch]);

  // one combined style fn/layer instead of a separate advisor-highlight layer
  // and search-highlight layer stacked on top of the same 1000+ polygons
  const styleFn = (feature) => {
    const pc = feature.properties.postcode;
    const hit = searchByPostcode.get(pc);
    if (hit) {
      return { fillColor: hit.color, fillOpacity: 0.5, color: hit.color, weight: 3 };
    }
    const isActive = selectedPostcodeSet && selectedPostcodeSet.has(pc);
    if (isActive) {
      return { fillColor: highlightColor, fillOpacity: 0.4, color: highlightColor, weight: 1.5 };
    }
    return { fillColor: "#888", fillOpacity: 0, color: "#999", weight: 0.3 };
  };

  useEffect(() => {
    if (advisorLayerRef.current) advisorLayerRef.current.setStyle(styleFn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPostcodeSet, highlightColor, searchByPostcode]);

  function showToast(message) {
    setToast(message);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(""), 2200);
  }

  function selectAdvisor(name) {
    if (selected === name) {
      setSelected(null);
      return;
    }
    setSelected(name);
    setDraft((advisorPostcodes[name] || []).join(", "));
    setSaved(false);
  }

  function clampPanelLeft(left, width) {
    const margin = 12;
    const panelWidth = Math.min(width ?? 280, window.innerWidth - margin * 2);
    const maxLeft = Math.max(margin, window.innerWidth - panelWidth - margin);
    return Math.min(Math.max(margin, left), maxLeft);
  }

  function clampPanelTop(top, height) {
    const margin = 12;
    // rough guess for the very first frame, before the panel is measured
    const estHeight = height ?? (150 + (tagDefs?.length || 0) * 30 + 140);
    const maxTop = Math.max(margin, window.innerHeight - Math.min(estHeight, window.innerHeight - margin * 2) - margin);
    return Math.min(Math.max(margin, top), maxTop);
  }

  function openPanel(name, e) {
    if (!isAdmin) return;
    const clickY = e?.clientY ?? 100;
    setPanelLeft(clampPanelLeft(276));
    setPanelTop(clampPanelTop(clickY - 40));
    setPanelAdvisor(name);
    setPanelPcDraft((advisorPostcodes[name] || []).join(", "));
    setPanelTags(advisorTags[name] || []);
    setPanelSaved(false);
    // keep the map highlight in sync so the admin can see what they're editing
    setSelected(name);
    setDraft((advisorPostcodes[name] || []).join(", "));
    setSaved(false);
  }

  function closePanel() {
    setPanelAdvisor(null);
  }

  function togglePanelTag(id) {
    setPanelTags((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  function applyPostcodeToggle(pc, has) {
    const current = advisorPostcodes[selected] || [];
    const nextList = has
      ? current.filter((p) => p !== pc)
      : Array.from(new Set([...current, pc])).sort();
    const nextOverrides = { ...overrides, [selected]: nextList };
    setOverrides(nextOverrides);
    if (firebaseEnabled) {
      saveOverridesShared(firebasePath, nextOverrides);
    } else {
      saveOverridesLocal(storageKey, nextOverrides);
    }

    setDraft(nextList.join(", "));
    if (panelAdvisor === selected) setPanelPcDraft(nextList.join(", "));
    showToast(has ? "Postcode verwijderd" : "Postcode toegevoegd");
  }

  // bound once via onEachFeature, so re-assigning this every render (instead of
  // relying on the closure captured at mount) keeps it seeing current state
  handlePostcodeClickRef.current = function handlePostcodeMapClick(pc, latlng) {
    if (!isAdmin || !selected || !mapRef.current) return;
    const current = advisorPostcodes[selected] || [];
    const has = current.includes(pc);
    const label = postcodeNames[pc] ? `${pc} (${postcodeNames[pc]})` : pc;

    if (activePopupRef.current) {
      activePopupRef.current.close();
    }

    const container = document.createElement("div");
    container.className = "postcode-popup-content";

    const title = document.createElement("div");
    title.className = "postcode-popup-title";
    title.textContent = `${label} · ${selected}`;
    container.appendChild(title);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = has ? "postcode-popup-btn remove" : "postcode-popup-btn add";
    btn.textContent = has ? "Verwijderen" : "Toevoegen";
    container.appendChild(btn);

    const popup = L.popup({ closeButton: true, className: "postcode-popup" })
      .setLatLng(latlng)
      .setContent(container);

    btn.addEventListener("click", () => {
      applyPostcodeToggle(pc, has);
      popup.close();
    });

    activePopupRef.current = popup;
    popup.openOn(mapRef.current);
  };

  function savePanel() {
    if (!isAdmin) return;
    const list = panelPcDraft
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^\d{4}$/.test(s));
    const uniquePcs = Array.from(new Set(list)).sort();
    const nextOverrides = { ...overrides, [panelAdvisor]: uniquePcs };
    setOverrides(nextOverrides);
    if (firebaseEnabled) {
      saveOverridesShared(firebasePath, nextOverrides);
    } else {
      saveOverridesLocal(storageKey, nextOverrides);
    }

    if (tagDefs && tagDefs.length) {
      const nextTagOverrides = { ...tagOverrides, [panelAdvisor]: panelTags };
      setTagOverrides(nextTagOverrides);
      if (firebaseEnabled) {
        saveOverridesShared(tagsFirebasePath, nextTagOverrides);
      } else {
        saveOverridesLocal(tagsStorageKey, nextTagOverrides);
      }
    }

    if (selected === panelAdvisor) setDraft(uniquePcs.join(", "));
    setPanelSaved(true);
    setTimeout(() => setPanelSaved(false), 1500);
    showToast("Wijzigingen opgeslagen");
  }

  function deleteAdvisor() {
    if (!isAdmin || !panelAdvisor) return;
    const ok = window.confirm(`Weet je zeker dat je "${panelAdvisor}" wilt verwijderen?`);
    if (!ok) return;

    const nextDeleted = { ...deletedAdvisors, [panelAdvisor]: true };
    setDeletedAdvisors(nextDeleted);
    if (firebaseEnabled) {
      saveOverridesShared(deletedFirebasePath, nextDeleted);
    } else {
      saveOverridesLocal(deletedStorageKey, nextDeleted);
    }

    if (selected === panelAdvisor) {
      setSelected(null);
      setDraft("");
    }
    setPanelAdvisor(null);
    showToast("Adviseur verwijderd");
  }

  function addAdvisor(e) {
    e.preventDefault();
    if (!isAdmin) return;
    const trimmed = newAdvisorName.trim();
    if (!trimmed) {
      setAddAdvisorError("Naam is verplicht");
      return;
    }
    if (advisorNames.includes(trimmed)) {
      setAddAdvisorError("Deze naam bestaat al");
      return;
    }
    setAddAdvisorError("");

    if (deletedAdvisors[trimmed]) {
      // re-adds someone who was previously deleted instead of creating a duplicate
      const nextDeleted = { ...deletedAdvisors };
      delete nextDeleted[trimmed];
      setDeletedAdvisors(nextDeleted);
      if (firebaseEnabled) {
        saveOverridesShared(deletedFirebasePath, nextDeleted);
      } else {
        saveOverridesLocal(deletedStorageKey, nextDeleted);
      }
    } else {
      const nextOverrides = { ...overrides, [trimmed]: [] };
      setOverrides(nextOverrides);
      if (firebaseEnabled) {
        saveOverridesShared(firebasePath, nextOverrides);
      } else {
        saveOverridesLocal(storageKey, nextOverrides);
      }
    }
    setNewAdvisorName("");
    showToast("Adviseur toegevoegd");
  }

  function openProfile(name) {
    setProfileViewName(name);
    setProfileSaved(false);
    if (isAdmin) {
      setProfileDraft({ ...emptyProfile(), ...(profiles[name] || {}) });
    }
  }

  function closeProfile() {
    setProfileViewName(null);
    setProfileDraft(null);
  }

  function updateProfileField(field, value) {
    setProfileDraft((prev) => ({ ...prev, [field]: value }));
  }

  function toggleProfileListField(field, value) {
    setProfileDraft((prev) => {
      const list = prev[field] || [];
      return {
        ...prev,
        [field]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
      };
    });
  }

  function saveProfile() {
    if (!isAdmin || !profileViewName || !profileDraft) return;
    const next = { ...profiles, [profileViewName]: profileDraft };
    setProfiles(next);
    if (firebaseEnabled) {
      saveOverridesShared(profilesFirebasePath, next);
    } else {
      saveOverridesLocal(profilesStorageKey, next);
    }
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 1500);
    showToast("Profiel opgeslagen");
  }

  function pruneExpiredNotes(list) {
    const today = new Date();
    return (list || []).filter((n) => new Date(n.expires) >= today);
  }

  function persistNotes(nextList) {
    setNotesList(nextList);
    if (firebaseEnabled) {
      saveOverridesShared(notesFirebasePath, nextList);
    } else {
      saveOverridesLocal(notesStorageKey, nextList);
    }
  }

  function addNote() {
    if (!isAdmin) return;
    const pc = noteDraftPostcode.trim();
    const name = noteDraftName.trim();
    if (!/^\d{4}$/.test(pc) || !availablePostcodes.has(pc)) {
      setNoteError("Onbekende postcode");
      return;
    }
    if (!name) {
      setNoteError("Naam is verplicht");
      return;
    }
    if (!noteDraftDate) {
      setNoteError("Datum is verplicht");
      return;
    }
    setNoteError("");
    const newNote = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      postcode: pc,
      name,
      expires: noteDraftDate,
    };
    persistNotes(pruneExpiredNotes([...notesList, newNote]));
    setNoteDraftPostcode("");
    setNoteDraftName("");
    setNoteDraftDate("");
    showToast("Notitie toegevoegd");
  }

  function deleteNote(id) {
    if (!isAdmin) return;
    persistNotes(notesList.filter((n) => n.id !== id));
    showToast("Notitie verwijderd");
  }

  const panelUnknown = panelPcDraft
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && (!/^\d{4}$/.test(s) || !availablePostcodes.has(s)));

  function reclampPanelToContent() {
    if (!panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    setPanelTop((t) => clampPanelTop(t, rect.height));
    setPanelLeft((l) => clampPanelLeft(l, rect.width));
  }

  // measure the panel's real rendered size and re-clamp -- a hardcoded
  // height estimate drifts out of sync whenever the panel's content changes
  useLayoutEffect(() => {
    if (!panelAdvisor) return;
    reclampPanelToContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelAdvisor, panelPcDraft, panelUnknown.length]);

  useEffect(() => {
    if (!panelAdvisor) return;
    window.addEventListener("resize", reclampPanelToContent);
    return () => window.removeEventListener("resize", reclampPanelToContent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelAdvisor]);

  function handleSave() {
    if (!isAdmin) return;
    const list = draft
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^\d{4}$/.test(s));
    const unique = Array.from(new Set(list)).sort();
    const next = { ...overrides, [selected]: unique };
    setOverrides(next);
    if (firebaseEnabled) {
      saveOverridesShared(firebasePath, next);
    } else {
      saveOverridesLocal(storageKey, next);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    showToast("Wijzigingen opgeslagen");
  }

  function handleReset() {
    if (!isAdmin) return;
    const ok = window.confirm(
      "Alle lokale aanpassingen voor dit tabblad wissen en teruggaan naar de standaardgegevens?"
    );
    if (!ok) return;
    localStorage.removeItem(storageKey);
    localStorage.removeItem(tagsStorageKey);
    localStorage.removeItem(deletedStorageKey);
    setOverrides({});
    setTagOverrides({});
    setDeletedAdvisors({});
    if (firebaseEnabled) {
      saveOverridesShared(firebasePath, {});
      saveOverridesShared(tagsFirebasePath, {});
      saveOverridesShared(deletedFirebasePath, {});
    }
    setSelected(null);
    setDraft("");
    setPanelAdvisor(null);
    showToast("Hersteld naar standaardgegevens");
  }

  const namesToPostcodes = useMemo(() => {
    return Object.entries(postcodeNames).map(([pc, name]) => ({ pc, name, lower: name.toLowerCase() }));
  }, [postcodeNames]);

  function runSearch() {
    const entries = searchFields.map((s) => s.trim()).filter(Boolean);
    const results = [];
    const missing = [];
    entries.forEach((entry, i) => {
      const isPostcode = /^\d{4}$/.test(entry);
      let matchedPostcodes = [];
      if (isPostcode && availablePostcodes.has(entry)) {
        matchedPostcodes = [entry];
      } else if (!isPostcode) {
        const needle = entry.toLowerCase();
        matchedPostcodes = namesToPostcodes.filter((n) => n.lower.includes(needle)).map((n) => n.pc);
      }
      if (matchedPostcodes.length) {
        matchedPostcodes.forEach((pc) => {
          const advisors = advisorNames.filter((name) => (advisorPostcodes[name] || []).includes(pc));
          results.push({ postcode: pc, name: postcodeNames[pc], color: SEARCH_COLORS[i], advisors });
        });
      } else {
        missing.push(entry);
      }
    });
    setActiveSearch(results);
    setSearchError(missing.length ? `Niet gevonden: ${missing.join(", ")}` : "");

    if (results.length && mapRef.current) {
      const points = results.map((r) => postcodeToCentroid[r.postcode]).filter(Boolean);
      if (points.length === 1) {
        mapRef.current.flyTo(points[0], 12);
      } else if (points.length > 1) {
        mapRef.current.flyToBounds(points, { padding: [60, 60], maxZoom: 12 });
      }
    }
  }

  function updateSearchField(i, value) {
    setSearchFields((prev) => prev.map((v, idx) => (idx === i ? value : v)));
  }

  function addSearchField() {
    setSearchFields((prev) => (prev.length < MAX_SEARCH_FIELDS ? [...prev, ""] : prev));
  }

  function clearSearch() {
    setActiveSearch([]);
    setSearchFields(["", ""]);
    setSearchError("");
  }

  const advisorSearchHighlight = useMemo(() => {
    const map = {};
    activeSearch.forEach(({ color, advisors }) => {
      advisors.forEach((name) => {
        if (!map[name]) map[name] = [];
        map[name].push(color);
      });
    });
    return map;
  }, [activeSearch]);

  const unknownInDraft = draft
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && (!/^\d{4}$/.test(s) || !availablePostcodes.has(s)));

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>Adviseurs</h1>
        <p className={firebaseEnabled ? "sync-status live" : "sync-status local"}>
          {firebaseEnabled ? "● Live gedeeld met iedereen" : "○ Enkel lokaal (niet gedeeld)"}
        </p>
        <p className="hint role-badge">{isAdmin ? "Beheerder · kan bewerken" : "Bekijker · geen bewerkrechten"}</p>
        {isAdmin && (
          <button className="reset-btn" onClick={() => setNotesPanelOpen(true)} title="Notities op de kaart toevoegen of verwijderen">
            🗒️ Notities beheren
          </button>
        )}
        {isAdmin && (
          <button className="reset-btn" onClick={handleReset} title="Wist eventuele lokale aanpassingen en gaat terug naar de standaardgegevens">
            ↺ Herstel naar standaardgegevens
          </button>
        )}
        {isAdmin && (
          <form className="add-advisor-form" onSubmit={addAdvisor}>
            <input
              type="text"
              placeholder="Naam nieuwe adviseur"
              value={newAdvisorName}
              onChange={(e) => { setNewAdvisorName(e.target.value); setAddAdvisorError(""); }}
            />
            <button type="submit" className="add-advisor-btn" title="Adviseur toevoegen">+</button>
          </form>
        )}
        {addAdvisorError && <p className="warning">{addAdvisorError}</p>}
        <p className="hint">
          Klik op een naam om de regio te tonen{isAdmin ? " · dubbelklik om te bewerken" : ""}
        </p>
        <ul className="advisor-list">
          {advisorNames.map((name, i) => {
            const searchHit = advisorSearchHighlight[name];
            const nameTags = advisorTags[name] || [];
            const oldPrioTag = tagDefs.find((td) => td.bold && nameTags.includes(td.id));
            const isTierA = profiles[name]?.tier === "A";
            const isPrio = Boolean(oldPrioTag) || isTierA;
            const prioLabel = oldPrioTag?.label || "A-Adviseur";
            const prioEmoji = oldPrioTag?.emoji || "👑";
            const nameProducts = profiles[name]?.products || [];
            const activeTags = PRODUCT_DEFS.filter((p) => nameProducts.includes(p.id));
            return (
              <li key={name} className="advisor-row">
                <button
                  className={selected === name ? "active" : ""}
                  style={
                    searchHit
                      ? { borderLeft: `4px solid ${searchHit[0]}`, background: searchHit[0] + "1a" }
                      : selected === name
                      ? { borderColor: colorForIndex(i), background: colorForIndex(i) + "22" }
                      : {}
                  }
                  onClick={() => selectAdvisor(name)}
                  onDoubleClick={isAdmin ? (e) => openPanel(name, e) : undefined}
                  title={isAdmin ? "Dubbelklik om te bewerken" : undefined}
                >
                  <span className="advisor-row-top">
                    <span className="dot" style={{ background: colorForIndex(i) }} />
                    <span style={isPrio ? { fontWeight: 700, background: "#FFD70055", padding: "1px 5px", borderRadius: "4px" } : {}}>{name}</span>
                    {isPrio && <span title={prioLabel}>{prioEmoji}</span>}
                    {advisorsHome[name]?.postcode && (
                      <span className="home-pc">{advisorsHome[name].postcode}</span>
                    )}
                    {(overrides[name] || tagOverrides[name]) && <span className="edited-mark" title="Aangepast">●</span>}
                  </span>
                  {activeTags.length > 0 && (
                    <span className="advisor-row-icons">
                      {activeTags.map((td) => <span key={td.id} title={td.label}>{td.emoji}</span>)}
                    </span>
                  )}
                </button>
                <button
                  className="profile-btn"
                  onClick={() => openProfile(name)}
                  title="Profiel bekijken"
                  aria-label={`Profiel van ${name}`}
                >
                  👤
                </button>
              </li>
            );
          })}
        </ul>

        {selected && isAdmin && (
          <div className="editor">
            <h2>{selected}</h2>
            <p className="hint">Postcodes, gescheiden door komma</p>
            <p className="hint">Of klik een postcode op de kaart om toe te voegen/verwijderen</p>
            <textarea rows={6} value={draft} onChange={(e) => setDraft(e.target.value)} />
            {unknownInDraft.length > 0 && (
              <p className="warning">Onbekend of ongeldig: {unknownInDraft.join(", ")}</p>
            )}
            <div className="editor-actions">
              <button className="save-btn" onClick={handleSave}>
                {saved ? "Opgeslagen ✓" : "Opslaan"}
              </button>
              <span className="count">{draft.split(",").map((s) => s.trim()).filter(Boolean).length} postcodes</span>
            </div>
          </div>
        )}
      </aside>

      <main className="map-wrap">
        <div className="search-bar">
          {searchFields.map((val, i) => (
            <input
              key={i}
              type="text"
              placeholder={i === 0 ? "Postcode of plaats, bv. 3600 of Genk" : `Postcode of plaats ${i + 1} (optioneel)`}
              value={val}
              onChange={(e) => updateSearchField(i, e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              style={{ borderLeft: `3px solid ${SEARCH_COLORS[i]}` }}
            />
          ))}
          <div className="search-actions">
            <button className="search-btn" onClick={runSearch}>Zoek</button>
            {searchFields.length < MAX_SEARCH_FIELDS && (
              <button className="search-add" onClick={addSearchField} title="Nog een postcode toevoegen">+ veld</button>
            )}
            {activeSearch.length > 0 && (
              <button className="search-clear" onClick={clearSearch}>Wissen</button>
            )}
          </div>
          {searchError && <span className="search-error">{searchError}</span>}
          {activeSearch.length > 0 && (
            <div className="search-results">
              {activeSearch.map(({ postcode, name, color, advisors }) => (
                <div key={postcode} className="search-result-row">
                  <span className="search-result-pc" style={{ color }}>{postcode}{name ? ` · ${name}` : ""}</span>
                  <span className="search-result-names">
                    {advisors.length
                      ? advisors.map((n, idx) => {
                          const isPrio = tagDefs.some((td) => td.bold && (advisorTags[n] || []).includes(td.id)) || profiles[n]?.tier === "A";
                          return (
                            <span key={n} style={isPrio ? { fontWeight: 700 } : {}}>
                              {n}{idx < advisors.length - 1 ? ", " : ""}
                            </span>
                          );
                        })
                      : "niemand toegewezen"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <MapContainer ref={mapRef} center={center} zoom={initialZoom} zoomControl={false} style={{ height: "100%", width: "100%" }}>
          <ZoomControl position="topright" />
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapEvents onZoom={setZoom} onBounds={setMapBounds} />

          {postcodesGeo && (
            <GeoJSON
              ref={advisorLayerRef}
              data={postcodesGeo}
              style={styleFn}
              renderer={canvasRenderer}
              onEachFeature={(feature, layer) => {
                layer.on("click", (e) => handlePostcodeClickRef.current(feature.properties.postcode, e.latlng));
              }}
            />
          )}

          {!showPostcodeLabels &&
            zoneLabels.map(({ zone, lat, lng }) => (
              <CircleMarker key={"zone-" + zone} center={[lat, lng]} radius={1} pathOptions={{ opacity: 0, fillOpacity: 0 }}>
                <Tooltip permanent direction="center" className="zone-label">{zone}</Tooltip>
              </CircleMarker>
            ))}

          {showPostcodeLabels &&
            visiblePostcodeLabels.map(({ pc, lat, lng }) => (
              <CircleMarker key={"pc-" + pc} center={[lat, lng]} radius={1} pathOptions={{ opacity: 0, fillOpacity: 0 }}>
                <Tooltip permanent direction="center" className="postcode-label">{pc}</Tooltip>
              </CircleMarker>
            ))}

          {Object.entries(notesByPostcode).map(([pc, list]) => {
            const c = postcodeToCentroid[pc];
            if (!c) return null;
            return (
              <CircleMarker key={"note-" + pc} center={c} radius={1} pathOptions={{ opacity: 0, fillOpacity: 0 }}>
                <Tooltip permanent direction="top" className="sticky-note-wrap">
                  <div
                    className="sticky-note"
                    style={{ transform: `scale(${Math.min(1.2, Math.max(0.55, (zoom - 6) / 5))})` }}
                  >
                    {groupNotesByName(list).map((g) => (
                      <div key={g.name}>{g.name} {g.dates.map(shortDate).join(" en ")}</div>
                    ))}
                  </div>
                </Tooltip>
              </CircleMarker>
            );
          })}

          <Pane name="homes" style={{ zIndex: 700 }}>
            {selected && homeCoords[selected] && (
              <Marker
                position={homeCoords[selected]}
                icon={L.divIcon({ html: "🏠", className: "home-house-icon", iconSize: [26, 26], iconAnchor: [13, 26] })}
              />
            )}
            {Object.entries(homeCoords).map(([name, latlng]) => {
              const isSel = selected === name;
              const dotSize = isSel ? 14 : 8;
              const dotColor = isSel ? highlightColor : "#444";
              return (
                <Marker
                  key={name}
                  position={latlng}
                  // offset into the top-right corner of the postcode, like a
                  // notification badge, instead of sitting on the postcode label
                  icon={L.divIcon({
                    html: `<span class="home-dot" style="width:${dotSize}px;height:${dotSize}px;background:${dotColor};"></span>`,
                    className: "home-dot-icon",
                    iconSize: [20, 20],
                    iconAnchor: [1, 19],
                  })}
                  eventHandlers={{ click: () => selectAdvisor(name) }}
                >
                  <Tooltip>
                    {name} · {postcodeNames[advisorsHome[name]?.postcode] || advisorsHome[name]?.city} ({advisorsHome[name]?.postcode})
                  </Tooltip>
                </Marker>
              );
            })}
          </Pane>
        </MapContainer>
      </main>

      {isAdmin && panelAdvisor && (
        <>
          <div className="advisor-panel-backdrop" onClick={closePanel} />
          <div className="advisor-panel" ref={panelRef} style={{ top: panelTop, left: panelLeft }}>
            <div className="advisor-panel-header">
              <h2>{panelAdvisor}</h2>
              <button className="advisor-panel-close" onClick={closePanel} aria-label="Sluiten">×</button>
            </div>
            <p className="hint">Postcodes, gescheiden door komma</p>
            <p className="hint">Of klik een postcode op de kaart om toe te voegen/verwijderen</p>
            <textarea rows={5} value={panelPcDraft} onChange={(e) => setPanelPcDraft(e.target.value)} />
            {panelUnknown.length > 0 && (
              <p className="warning">Onbekend of ongeldig: {panelUnknown.join(", ")}</p>
            )}
            {tagDefs.some((td) => td.bold) && (
              <div className="advisor-panel-tags">
                <p className="hint">Prioriteit</p>
                {tagDefs.filter((td) => td.bold).map((td) => (
                  <label key={td.id} className="advisor-panel-tag">
                    <input
                      type="checkbox"
                      checked={panelTags.includes(td.id)}
                      onChange={() => togglePanelTag(td.id)}
                    />
                    <span>{td.emoji} {td.label}</span>
                  </label>
                ))}
                <p className="hint">Producten aanpassen kan via het profiel (👤)</p>
              </div>
            )}
            <div className="editor-actions">
              <button className="save-btn" onClick={savePanel}>
                {panelSaved ? "Opgeslagen ✓" : "Opslaan"}
              </button>
              <button className="panel-close-btn" onClick={closePanel}>Sluiten</button>
            </div>
            <div className="advisor-panel-danger">
              <button className="delete-btn" onClick={deleteAdvisor}>Verwijder</button>
            </div>
          </div>
        </>
      )}

      {isAdmin && notesPanelOpen && (
        <>
          <div className="advisor-panel-backdrop" onClick={() => setNotesPanelOpen(false)} />
          <div className="advisor-panel notes-panel">
            <div className="advisor-panel-header">
              <h2>Notities</h2>
              <button className="advisor-panel-close" onClick={() => setNotesPanelOpen(false)} aria-label="Sluiten">×</button>
            </div>

            <div className="notes-form">
              <input
                type="text"
                placeholder="Postcode"
                value={noteDraftPostcode}
                onChange={(e) => setNoteDraftPostcode(e.target.value)}
              />
              <input
                type="text"
                placeholder="Naam"
                value={noteDraftName}
                onChange={(e) => setNoteDraftName(e.target.value)}
              />
              <input
                type="date"
                value={noteDraftDate}
                onChange={(e) => setNoteDraftDate(e.target.value)}
              />
              {noteError && <p className="warning">{noteError}</p>}
              <button className="save-btn" onClick={addNote}>+ Toevoegen</button>
            </div>

            <div className="notes-list">
              {activeNotes.length === 0 && <p className="hint">Geen actieve notities</p>}
              {activeNotes
                .slice()
                .sort((a, b) => a.expires.localeCompare(b.expires))
                .map((n) => (
                  <div key={n.id} className="notes-list-row">
                    <span>{n.postcode} · {n.name} · {shortDate(n.expires)}</span>
                    <button className="notes-list-delete" onClick={() => deleteNote(n.id)} aria-label="Verwijder">×</button>
                  </div>
                ))}
            </div>
          </div>
        </>
      )}

      {profileViewName && (() => {
        const viewProfile = profiles[profileViewName] || emptyProfile();
        return (
          <>
            <div className="advisor-panel-backdrop" onClick={closeProfile} />
            <div className="advisor-panel profile-panel">
              <div className="advisor-panel-header">
                <h2>{profileViewName}</h2>
                <button className="advisor-panel-close" onClick={closeProfile} aria-label="Sluiten">×</button>
              </div>

              {isAdmin && profileDraft ? (
                <>
                  <div className="profile-photo"><ProfileAvatar gender={profileDraft.gender} /></div>
                  <div className="profile-section">
                    <p className="hint">Profielfoto</p>
                    <div className="profile-radio-row">
                      <label><input type="radio" name="gender" checked={profileDraft.gender === "m"} onChange={() => updateProfileField("gender", "m")} /> Man</label>
                      <label><input type="radio" name="gender" checked={profileDraft.gender === "v"} onChange={() => updateProfileField("gender", "v")} /> Vrouw</label>
                    </div>
                  </div>

                  <div className="profile-section">
                    <p className="hint">👑 Type adviseur</p>
                    <div className="profile-radio-row">
                      <label><input type="radio" name="tier" checked={profileDraft.tier === "A"} onChange={() => updateProfileField("tier", "A")} /> 👑 A-Adviseur</label>
                      <label><input type="radio" name="tier" checked={profileDraft.tier === "B"} onChange={() => updateProfileField("tier", "B")} /> B-Adviseur</label>
                    </div>
                  </div>

                  <div className="profile-section">
                    <p className="hint">Welke producten</p>
                    {PRODUCT_DEFS.map((p) => (
                      <label key={p.id} className="profile-checkbox-row">
                        <input
                          type="checkbox"
                          checked={profileDraft.products.includes(p.id)}
                          onChange={() => toggleProfileListField("products", p.id)}
                        />
                        <span>{p.emoji} {p.label}</span>
                      </label>
                    ))}
                  </div>

                  <div className="profile-section">
                    <p className="hint">Online offerte</p>
                    <div className="profile-radio-row">
                      <label><input type="radio" name="onlineOfferte" checked={profileDraft.onlineOfferte === "ja"} onChange={() => updateProfileField("onlineOfferte", "ja")} /> 👍 Ja!</label>
                      <label><input type="radio" name="onlineOfferte" checked={profileDraft.onlineOfferte === "nee"} onChange={() => updateProfileField("onlineOfferte", "nee")} /> 👎 Nee!</label>
                      <label><input type="radio" name="onlineOfferte" checked={profileDraft.onlineOfferte === "eigen_klant"} onChange={() => updateProfileField("onlineOfferte", "eigen_klant")} /> Enkel eigen klant</label>
                    </div>
                  </div>

                  <div className="profile-section">
                    <p className="hint">Welke talen</p>
                    {LANGUAGE_DEFS.map((lang) => (
                      <label key={lang} className="profile-checkbox-row">
                        <input
                          type="checkbox"
                          checked={profileDraft.languages.includes(lang)}
                          onChange={() => toggleProfileListField("languages", lang)}
                        />
                        <span>{lang}</span>
                      </label>
                    ))}
                    <input
                      type="text"
                      placeholder="Andere taal, vrij in te voeren"
                      value={profileDraft.languagesExtra}
                      onChange={(e) => updateProfileField("languagesExtra", e.target.value)}
                    />
                  </div>

                  <div className="profile-section">
                    <p className="hint">Doet een afspraak voor ENKEL een thuisbatterij</p>
                    <div className="profile-radio-row">
                      <label><input type="radio" name="thuisbatterijEnkel" checked={profileDraft.thuisbatterijEnkel === "ja"} onChange={() => updateProfileField("thuisbatterijEnkel", "ja")} /> 👍 Ja!</label>
                      <label><input type="radio" name="thuisbatterijEnkel" checked={profileDraft.thuisbatterijEnkel === "nee"} onChange={() => updateProfileField("thuisbatterijEnkel", "nee")} /> 👎 Nee!</label>
                    </div>
                  </div>

                  <div className="profile-section">
                    <p className="hint">Thuisbasis (postcode en gemeente)</p>
                    <input
                      type="text"
                      placeholder={advisorsHome[profileViewName]?.postcode || "Postcode"}
                      value={profileDraft.homeBasePostcode}
                      onChange={(e) => updateProfileField("homeBasePostcode", e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder={advisorsHome[profileViewName]?.city || "Gemeente"}
                      value={profileDraft.homeBaseCity}
                      onChange={(e) => updateProfileField("homeBaseCity", e.target.value)}
                    />
                  </div>

                  <div className="profile-section">
                    <p className="hint">Eerste/laatste afspraak: max. … min van thuisbasis</p>
                    <input
                      type="number"
                      min="0"
                      placeholder="Minuten"
                      value={profileDraft.travelRadiusMin}
                      onChange={(e) => updateProfileField("travelRadiusMin", e.target.value)}
                    />
                  </div>

                  <div className="profile-section">
                    <p className="hint">Extra info</p>
                    <textarea rows={4} value={profileDraft.extraInfo} onChange={(e) => updateProfileField("extraInfo", e.target.value)} />
                  </div>

                  <div className="editor-actions">
                    <button className="save-btn" onClick={saveProfile}>
                      {profileSaved ? "Opgeslagen ✓" : "Opslaan"}
                    </button>
                    <button className="panel-close-btn" onClick={closeProfile}>Sluiten</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="profile-photo"><ProfileAvatar gender={viewProfile.gender} /></div>
                  {viewProfile.tier && (
                    <p className="profile-tier">{viewProfile.tier === "A" ? "👑 A-Adviseur" : "B-Adviseur"}</p>
                  )}

                  <div className="profile-section">
                    <p className="hint">Welke producten</p>
                    <div className="profile-chip-row">
                      {PRODUCT_DEFS.filter((p) => viewProfile.products.includes(p.id)).map((p) => (
                        <span key={p.id} className="profile-chip">{p.emoji} {p.label}</span>
                      ))}
                      {viewProfile.products.length === 0 && <span className="hint">Nog niet ingevuld</span>}
                    </div>
                  </div>

                  <div className="profile-section">
                    <p className="hint">Online offerte</p>
                    <p>{ONLINE_OFFERTE_LABELS[viewProfile.onlineOfferte] || "Nog niet ingevuld"}</p>
                  </div>

                  <div className="profile-section">
                    <p className="hint">Welke talen</p>
                    <p>{[...viewProfile.languages, viewProfile.languagesExtra].filter(Boolean).join(", ") || "Nog niet ingevuld"}</p>
                  </div>

                  <div className="profile-section">
                    <p className="hint">Doet een afspraak voor ENKEL een thuisbatterij</p>
                    <p>
                      {viewProfile.thuisbatterijEnkel === "ja"
                        ? "👍 Ja!"
                        : viewProfile.thuisbatterijEnkel === "nee"
                        ? "👎 Nee!"
                        : "Nog niet ingevuld"}
                    </p>
                  </div>

                  <div className="profile-section">
                    <p className="hint">Thuisbasis</p>
                    <p>
                      {viewProfile.homeBasePostcode || advisorsHome[profileViewName]?.postcode || "?"}
                      {" · "}
                      {viewProfile.homeBaseCity || postcodeNames[advisorsHome[profileViewName]?.postcode] || advisorsHome[profileViewName]?.city || ""}
                    </p>
                  </div>

                  <div className="profile-section">
                    <p className="hint">Reisradius eerste/laatste afspraak</p>
                    <p>{viewProfile.travelRadiusMin ? `max. ${viewProfile.travelRadiusMin} min van thuisbasis` : "Nog niet ingevuld"}</p>
                  </div>

                  <div className="profile-section">
                    <p className="hint">Extra info</p>
                    <p className="profile-extra-info">{viewProfile.extraInfo || "-"}</p>
                  </div>

                  <div className="editor-actions">
                    <button className="panel-close-btn" onClick={closeProfile}>Sluiten</button>
                  </div>
                </>
              )}
            </div>
          </>
        );
      })()}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
