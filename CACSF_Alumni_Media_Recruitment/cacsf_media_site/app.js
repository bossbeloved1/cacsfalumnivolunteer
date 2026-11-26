
"use strict";

/* =========================================
   CACSF ALUMNI FELLOWSHIP MEDIA UNIT
   PUBLIC APPLICATION WEBSITE
========================================= */

const skillOptions = [
  'Graphic Designer',
  'Content Designer',
  'Content Writer',
  'Copywriter',
  'Scriptwriter',
  'Video Editor',
  'Videographer',
  'Photographer',
  'Website Developer',
  'Technical Support',
  'Social Media Manager',
  'Digital Marketer',
  'Motion Graphics Designer',
  'Animator',
  'Sound Engineer',
  'Livestream / Broadcast',
  'Audio Engineer',
  'UI/UX Designer',
  'Brand Designer',
  'Other'
];

const skillWrap = document.querySelector('#skills');
const form = document.querySelector('#application');
const fileInput = document.querySelector('#portfolioFiles');
const fileList = document.querySelector('#fileList');
const stateSelect = document.querySelector('#state');
const citySelect = document.querySelector('#city');
const statusBox = document.querySelector('#registrationStatus');

const disclaimer = document.querySelector('#disclaimer');
const successModal = document.querySelector('#success');
const closedModal = document.querySelector('#registrationClosed');

const submitButton = form.querySelector('.submit');

let registrationOpen = false;
let graphicDesignerFull = false;
let capacityLoaded = false;

/* =========================================
   SUPABASE CONNECTION
========================================= */

const cfg = window.CACSF_CONFIG || {};

const cloud = Boolean(
  cfg.supabaseUrl &&
  cfg.supabaseAnonKey &&
  window.supabase
);

const sb = cloud
  ? window.supabase.createClient(
      cfg.supabaseUrl,
      cfg.supabaseAnonKey
    )
  : null;

/* =========================================
   CURRENT YEAR
========================================= */

document.querySelector('#year').textContent =
  new Date().getFullYear();

/* =========================================
   ALUMNI SETS
========================================= */

const setSelect = document.querySelector('#setYear');

for (
  let y = 1995;
  y <= new Date().getFullYear();
  y++
) {
  const option = document.createElement('option');

  option.value = `${y}/${y + 1}`;
  option.textContent = `${y}/${y + 1}`;

  setSelect.append(option);
}

/* =========================================
   NIGERIAN STATES AND EXISTING LOCATIONS
   FALLBACK DATA
========================================= */

const places = {
  'Abia': [
    'Aba', 'Umuahia', 'Ohafia', 'Arochukwu',
    'Bende', 'Isiala Ngwa', 'Isuikwuato',
    'Obingwa', 'Umunneochi'
  ],

  'Adamawa': [
    'Yola', 'Mubi', 'Jimeta', 'Numan',
    'Ganye', 'Gombi', 'Michika', 'Fufore', 'Hong'
  ],

  'Akwa Ibom': [
    'Uyo', 'Eket', 'Ikot Ekpene', 'Oron',
    'Abak', 'Etinan', 'Itu', 'Ikot Abasi', 'Ibeno'
  ],

  'Anambra': [
    'Awka', 'Onitsha', 'Nnewi', 'Ekwulobia',
    'Ihiala', 'Ogidi', 'Ozubulu', 'Otuocha', 'Abagana'
  ],

  'Bauchi': [
    'Bauchi', 'Azare', 'Misau', 'Jama’are',
    'Ningi', 'Katagum', 'Dass', 'Tafawa Balewa'
  ],

  'Bayelsa': [
    'Yenagoa', 'Brass', 'Ogbia', 'Nembe',
    'Sagbama', 'Kaiama', 'Oporoma', 'Amassoma'
  ],

  'Benue': [
    'Makurdi', 'Gboko', 'Otukpo', 'Katsina-Ala',
    'Adikpo', 'Vandeikya', 'Aliade', 'Logo', 'Ugbokolo'
  ],

  'Borno': [
    'Maiduguri', 'Biu', 'Bama', 'Dikwa',
    'Monguno', 'Gwoza', 'Konduga', 'Damboa'
  ],

  'Cross River': [
    'Calabar', 'Ikom', 'Ogoja', 'Ugep',
    'Obudu', 'Akamkpa', 'Obubra', 'Bakassi'
  ],

  'Delta': [
    'Asaba', 'Warri', 'Sapele', 'Ughelli',
    'Effurun', 'Agbor', 'Oleh', 'Ozoro',
    'Abraka', 'Kwale'
  ],

  'Ebonyi': [
    'Abakaliki', 'Afikpo', 'Onueke',
    'Ezzamgbo', 'Ishielu', 'Uburu', 'Onicha'
  ],

  'Edo': [
    'Benin City', 'Auchi', 'Ekpoma', 'Irrua',
    'Uromi', 'Igarra', 'Sabongida-Ora', 'Ubiaja'
  ],

  'Ekiti': [
    'Ado-Ekiti', 'Ikere-Ekiti', 'Iyin-Ekiti',
    'Ijero-Ekiti', 'Oye-Ekiti', 'Otun-Ekiti',
    'Ikole-Ekiti', 'Emure-Ekiti', 'Ilawe-Ekiti'
  ],

  'Enugu': [
    'Enugu', 'Nsukka', 'Agbani', 'Udi',
    'Oji River', 'Awgu', 'Eha Amufu', 'Nkanu'
  ],

  'Gombe': [
    'Gombe', 'Kaltungo', 'Billiri', 'Bajoga',
    'Dukku', 'Deba', 'Kumo', 'Pindiga'
  ],

  'Imo': [
    'Owerri', 'Orlu', 'Okigwe', 'Mbaise',
    'Oguta', 'Mbano', 'Nkwerre', 'Isu'
  ],

  'Jigawa': [
    'Dutse', 'Hadejia', 'Kazaure', 'Gumel',
    'Ringim', 'Birnin Kudu', 'Gwaram', 'Auyo'
  ],

  'Kaduna': [
    'Kaduna', 'Zaria', 'Kafanchan', 'Kachia',
    'Saminaka', 'Birnin Gwari', 'Jaji', 'Zonkwa'
  ],

  'Kano': [
    'Kano', 'Wudil', 'Gwarzo', 'Bichi',
    'Rano', 'Dawakin Kudu', 'Karaye', 'Kura'
  ],

  'Katsina': [
    'Katsina', 'Daura', 'Funtua', 'Malumfashi',
    'Dutsin-Ma', 'Kankia', 'Jibia', 'Mani'
  ],

  'Kebbi': [
    'Birnin Kebbi', 'Argungu', 'Yauri', 'Zuru',
    'Kamba', 'Jega', 'Koko', 'Dakingari'
  ],

  'Kogi': [
    'Lokoja', 'Okene', 'Kabba', 'Idah',
    'Ankpa', 'Anyigba', 'Ajaokuta', 'Dekina'
  ],

  'Kwara': [
    'Ilorin', 'Offa', 'Jebba', 'Lafiagi',
    'Omu-Aran', 'Patigi', 'Kaiama', 'Share'
  ],

  'Lagos': [
    'Ikeja', 'Lagos Island', 'Victoria Island',
    'Lekki', 'Epe', 'Badagry', 'Ikorodu',
    'Surulere', 'Yaba', 'Agege', 'Alimosho',
    'Ojo', 'Festac', 'Apapa'
  ],

  'Nasarawa': [
    'Lafia', 'Keffi', 'Karu', 'Akwanga',
    'Nasarawa', 'Doma', 'Wamba', 'Toto'
  ],

  'Niger': [
    'Minna', 'Suleja', 'Bida', 'Kontagora',
    'New Bussa', 'Lapai', 'Mokwa', 'Kagara'
  ],

  'Ogun': [
    'Abeokuta', 'Ijebu-Ode', 'Sagamu', 'Ota',
    'Ilaro', 'Ayetoro', 'Ifo', 'Ijebu-Igbo', 'Owode'
  ],

  'Ondo': [
    'Akure', 'Ondo', 'Owo', 'Ikare-Akoko',
    'Okitipupa', 'Ore', 'Idanre', 'Igbokoda'
  ],

  'Osun': [
    'Osogbo', 'Ile-Ife', 'Ilesa', 'Ede',
    'Iwo', 'Ikirun', 'Ejigbo', 'Gbongan'
  ],

  'Oyo': [
    'Ibadan', 'Ogbomoso', 'Oyo', 'Iseyin',
    'Saki', 'Eruwa', 'Igbo-Ora', 'Kishi', 'Fiditi'
  ],

  'Plateau': [
    'Jos', 'Bukuru', 'Barkin Ladi', 'Pankshin',
    'Shendam', 'Mangu', 'Langtang', 'Vom'
  ],

  'Rivers': [
    'Port Harcourt', 'Obio-Akpor', 'Bonny',
    'Eleme', 'Okrika', 'Bori', 'Ahoada',
    'Omoku', 'Degema'
  ],

  'Sokoto': [
    'Sokoto', 'Tambuwal', 'Wurno', 'Bodinga',
    'Gwadabawa', 'Illela', 'Kware', 'Yabo'
  ],

  'Taraba': [
    'Jalingo', 'Wukari', 'Bali', 'Gembu',
    'Serti', 'Takum', 'Zing', 'Karim Lamido'
  ],

  'Yobe': [
    'Damaturu', 'Potiskum', 'Gashua', 'Nguru',
    'Geidam', 'Buni Yadi', 'Fika', 'Gujba'
  ],

  'Zamfara': [
    'Gusau', 'Kaura Namoda', 'Talata Mafara',
    'Anka', 'Bungudu', 'Maru', 'Tsafe', 'Zurmi'
  ],

  'Federal Capital Territory': [
    'Abuja', 'Garki', 'Wuse', 'Maitama',
    'Asokoro', 'Gwarinpa', 'Kubwa', 'Lugbe',
    'Kuje', 'Bwari', 'Nyanya', 'Jikwoyi'
  ]
};

/* =========================================
   EXPANDED NIGERIAN LOCATION DATA
========================================= */

/*
  This dataset contains:
  - 36 Nigerian states and the FCT
  - 774 Local Government Areas
  - Towns, districts and neighbourhoods
    listed under the LGAs.

  The data is loaded from a public JSON
  dataset hosted on GitHub.

  Existing locations above remain available
  if the external dataset cannot load.
*/

const LOCATION_DATA_URL =
  'https://raw.githubusercontent.com/ayoolaowoilu/Nigeria-Locations-Dataset-2026-API/main/nigeria_locations.json';

let expandedPlaces = {};
let locationDatasetLoaded = false;

function normalizeStateName(name) {
  const value = String(name || '').trim().toLowerCase();

  const aliases = {
    'fct': 'Federal Capital Territory',
    'abuja': 'Federal Capital Territory',
    'federal capital territory': 'Federal Capital Territory',
    'akwa-ibom': 'Akwa Ibom',
    'crossriver': 'Cross River',
    'rivers state': 'Rivers',
    'nassarawa': 'Nasarawa'
  };

  return aliases[value] ||
    Object.keys(places).find(
      state => state.toLowerCase() === value
    ) ||
    name;
}

function uniqueLocations(items) {
  const seen = new Set();

  return items
    .filter(item => typeof item === 'string')
    .map(item => item.trim())
    .filter(item => {
      if (!item) return false;

      const key = item.toLowerCase();

      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    })
    .sort((a, b) => a.localeCompare(b));
}

async function loadExpandedLocations() {
  try {
    const response = await fetch(LOCATION_DATA_URL, {
      method: 'GET',
      cache: 'no-cache'
    });

    if (!response.ok) {
      throw new Error(
        `Location dataset request failed: ${response.status}`
      );
    }

    const dataset = await response.json();

    if (
      !dataset ||
      !Array.isArray(dataset.states) ||
      dataset.states.length === 0
    ) {
      throw new Error('Invalid location dataset format.');
    }

    const result = {};

    dataset.states.forEach(stateData => {
      const stateName = normalizeStateName(stateData.name);

      const locations = [];

      /*
        Add the state capital.
      */

      if (stateData.capital) {
        locations.push(stateData.capital);
      }

      /*
        Add each LGA and its local areas.
      */

      (stateData.lgas || []).forEach(lga => {
        if (lga.name) {
          locations.push(lga.name);
        }

        (lga.areas || []).forEach(area => {
          locations.push(area);
        });
      });

      result[stateName] = uniqueLocations(locations);
    });

    expandedPlaces = result;
    locationDatasetLoaded = true;

    /*
      Refresh the selected state's options
      if a visitor selected a state while
      the dataset was still loading.
    */

    if (stateSelect.value) {
      populateCityOptions(stateSelect.value);
    }

    console.info(
      'Expanded Nigerian location dataset loaded successfully.'
    );

    return true;

  } catch (error) {
    console.warn(
      'Could not load expanded location dataset. Using fallback locations.',
      error
    );

    locationDatasetLoaded = false;

    return false;
  }
}

/* =========================================
   GET LOCATIONS FOR SELECTED STATE
========================================= */

function getLocationsForState(state) {
  if (locationDatasetLoaded && expandedPlaces[state]?.length) {
    return expandedPlaces[state];
  }

  return places[state] || [];
}

/* =========================================
   POPULATE STATE OPTIONS
========================================= */

Object.keys(places)
  .sort((a, b) =>
    a === 'Federal Capital Territory'
      ? 1
      : b === 'Federal Capital Territory'
        ? -1
        : a.localeCompare(b)
  )
  .forEach(state => {
    const option = document.createElement('option');

    option.value = state;
    option.textContent = state;

    stateSelect.append(option);
  });

/* =========================================
   POPULATE CITY / TOWN OPTIONS
========================================= */

function populateCityOptions(state) {
  citySelect.innerHTML =
    '<option value="">Select city / town</option>';

  citySelect.disabled = !state;

  if (!state) return;

  const locations = getLocationsForState(state);

  locations.forEach(location => {
    const option = document.createElement('option');

    option.value = location;
    option.textContent = location;

    citySelect.append(option);
  });
}

/* When the selected state changes */

stateSelect.addEventListener('change', () => {
  populateCityOptions(stateSelect.value);
});

/*
  Load expanded locations in the background.
  The form remains usable with the fallback
  list while the dataset is loading.
*/

loadExpandedLocations();

/* =========================================
   SKILL OPTIONS
========================================= */

skillOptions.forEach(skill => {
  const label = document.createElement('label');

  label.className = 'skill';
  label.dataset.skill = skill;

  const checkbox = document.createElement('input');

  checkbox.type = 'checkbox';
  checkbox.name = 'skills';
  checkbox.value = skill;

  const text = document.createElement('span');
  text.textContent = skill;

  label.append(checkbox, text);
  skillWrap.append(label);
});

/* =========================================
   REGISTRATION CAPACITY
========================================= */

function showClosedRegistration() {
  registrationOpen = false;

  statusBox.className =
    'registration-status is-closed';

  statusBox.textContent =
    'Registration has closed for now. You can come back again when registration is open.';

  form.querySelectorAll('input, textarea, select, button')
    .forEach(element => {
      element.disabled = true;
    });

  document.querySelector('#registrationClosed')
    .classList.add('show');
}

/*
  When two applicants have selected Graphic Designer,
  disable that option without displaying a FULL message.
*/

function updateGraphicDesignerOption(count) {
  graphicDesignerFull = count >= 2;

  const label = skillWrap.querySelector(
    '[data-skill="Graphic Designer"]'
  );

  if (!label) return;

  const checkbox = label.querySelector('input');

  if (graphicDesignerFull) {
    checkbox.checked = false;
    checkbox.disabled = true;
    label.classList.add('unavailable');
  } else {
    checkbox.disabled = false;
    label.classList.remove('unavailable');
  }
}

async function refreshCapacity() {
  if (!sb) {
    capacityLoaded = false;
    registrationOpen = false;

    statusBox.className =
      'registration-status is-closed';

    statusBox.textContent =
      'Registration service is temporarily unavailable. Please try again later.';

    return false;
  }

  try {
    const { data, error } = await sb.rpc(
      'get_application_capacity'
    );

    if (error) throw error;

    const total = Number(data.total);
    const graphicCount = Number(data.graphic_designer);

    const totalLimit = Number(data.total_limit);
    const graphicLimit = Number(data.graphic_designer_limit);

    capacityLoaded = true;
    registrationOpen = data.registration_open === true;

    updateGraphicDesignerOption(graphicCount);

    if (!registrationOpen || total >= totalLimit) {
      showClosedRegistration();
      return false;
    }

    statusBox.className =
      'registration-status is-open';

    statusBox.textContent =
      `${totalLimit - total} registration place(s) remaining out of ${totalLimit}. ` +
      `Graphic Designer: ${graphicCount} of ${graphicLimit} places filled.`;

    return true;

  } catch (error) {
    console.error('Capacity check failed:', error);

    capacityLoaded = false;
    registrationOpen = false;

    statusBox.className =
      'registration-status is-closed';

    statusBox.textContent =
      'We could not check registration availability. Please refresh the page and try again.';

    return false;
  }
}

/* Check availability when the page opens */

refreshCapacity();

/* =========================================
   PORTFOLIO FILE UPLOAD DISPLAY
========================================= */

fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 10) {
    alert('You can upload a maximum of 10 files.');

    fileInput.value = '';
    fileList.textContent = '';

    return;
  }

  fileList.textContent = [...fileInput.files]
    .map(file =>
      `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`
    )
    .join(' · ');
});

/* =========================================
   WELCOME DISCLAIMER
========================================= */

document.body.classList.add('modal-open');

document.querySelector('#continueBtn')
  .addEventListener('click', async () => {

    disclaimer.classList.remove('show');

    document.body.classList.remove('gate-locked');
    document.body.classList.remove('modal-open');

    const available = await refreshCapacity();

    if (!available && capacityLoaded) {
      showClosedRegistration();
    }
  });

/* =========================================
   APPLICATION SUBMISSION
========================================= */

form.addEventListener('submit', async event => {
  event.preventDefault();

  if (!form.reportValidity()) return;

  if (!sb) {
    alert(
      'The registration service is unavailable. Please try again later.'
    );

    return;
  }

  if (!capacityLoaded) {
    const available = await refreshCapacity();

    if (!available) {
      if (capacityLoaded) showClosedRegistration();
      return;
    }
  }

  if (!registrationOpen) {
    showClosedRegistration();
    return;
  }

  const skills = [
    ...form.querySelectorAll(
      'input[name="skills"]:checked'
    )
  ].map(input => input.value);

  if (!skills.length) {
    alert('Please select at least one skill.');
    return;
  }

  const files = [...fileInput.files];

  if (files.length > 10) {
    alert('You can upload a maximum of 10 files.');
    return;
  }

  const available = await refreshCapacity();

  if (!available) {
    if (capacityLoaded) showClosedRegistration();
    return;
  }

  if (
    skills.includes('Graphic Designer') &&
    graphicDesignerFull
  ) {
    alert(
      'Graphic Designer registration is full. Please select another skill.'
    );

    return;
  }

  const formData = new FormData(form);

  const state = formData.get('state');
  const city = formData.get('city');

  const data = {
    full_name: formData.get('full_name'),
    set_year: formData.get('set_year'),
    phone: formData.get('phone'),
    whatsapp: formData.get('whatsapp'),
    email: formData.get('email'),
    gender: formData.get('gender'),
    state,
    city,
    location: `${city}, ${state}`,
    bio: formData.get('bio'),
    skills,
    portfolio: formData.get('portfolio'),
    experience: formData.get('experience'),
    portfolio_files: [],
    created_at: new Date().toISOString()
  };

  submitButton.disabled = true;
  submitButton.textContent = 'Submitting…';

  try {

    /* Upload portfolio files */

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      const safeName = file.name.replace(
        /[^a-zA-Z0-9._-]/g,
        '_'
      );

      const path =
        `${Date.now()}_${i}_${safeName}`;

      const { error: uploadError } = await sb
        .storage
        .from('applicant-portfolio')
        .upload(path, file, {
          upsert: false
        });

      if (uploadError) throw uploadError;

      data.portfolio_files.push({
        name: file.name,
        path,
        size: file.size,
        type: file.type
      });
    }

    /* Submit application to Supabase */

    const { error } = await sb
      .from('applications')
      .insert(data);

    if (error) {

      const errorMessage = (
        error.message || ''
      ).toUpperCase();

      if (
        errorMessage.includes('REGISTRATION_CLOSED')
      ) {
        showClosedRegistration();
        return;
      }

      if (
        errorMessage.includes('GRAPHIC_DESIGN_FULL')
      ) {
        alert(
          'Graphic Designer registration has just filled up. Please choose another skill and submit again.'
        );

        await refreshCapacity();

        return;
      }

      throw error;
    }

    form.reset();

    citySelect.innerHTML =
      '<option value="">Select your state first</option>';

    citySelect.disabled = true;

    fileList.textContent = '';

    successModal.classList.add('show');

    await refreshCapacity();

  } catch (error) {

    console.error('Application submission error:', error);

    alert(
      'Submission failed. Please try again. ' +
      (error.message || '')
    );

    await refreshCapacity();

  } finally {

    submitButton.disabled = false;

    submitButton.innerHTML =
      'Submit application <span>↗</span>';
  }
});

/* =========================================
   CLOSE SUCCESS POPUP
========================================= */

document.querySelector('#closeModal')
  .addEventListener('click', () => {
    successModal.classList.remove('show');
  });

/* =========================================
   CLOSE REGISTRATION POPUP
========================================= */

document.querySelector('#closeRegistration')
  .addEventListener('click', () => {
    closedModal.classList.remove('show');
  });
