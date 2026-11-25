const skillOptions=['Graphic Designer','Content Designer','Content Writer','Copywriter','Scriptwriter','Video Editor','Videographer','Photographer','Website Developer','Web Designer','Technical Support','Social Media Manager','Digital Marketer','Motion Graphics Designer','Animator','Sound Engineer','Livestream / Broadcast','Audio Engineer','UI/UX Designer','Brand Designer','Other'];
const skillWrap=document.querySelector('#skills');skillOptions.forEach(s=>{skillWrap.insertAdjacentHTML('beforeend',`<label class="skill"><input type="checkbox" name="skills" value="${s}"> ${s}</label>`)});
document.querySelector('#year').textContent=new Date().getFullYear();
// Alumni sets run from 1995/1996 through the current academic set.
const setSelect=document.querySelector('#setYear');for(let y=1995;y<=new Date().getFullYear();y++){const o=document.createElement('option');o.value=`${y}/${y+1}`;o.textContent=`${y}/${y+1}`;setSelect.append(o)}
// Nigerian states and commonly recognised cities/towns in each state.
const places={
'Abia':['Aba','Umuahia','Ohafia','Arochukwu','Bende','Isiala Ngwa','Isuikwuato','Obingwa','Umunneochi'],
'Adamawa':['Yola','Mubi','Jimeta','Numan','Ganye','Gombi','Michika','Fufore','Hong'],
'Akwa Ibom':['Uyo','Eket','Ikot Ekpene','Oron','Abak','Etinan','Itu','Ikot Abasi','Ibeno'],
'Anambra':['Awka','Onitsha','Nnewi','Ekwulobia','Ihiala','Ogidi','Ozubulu','Otuocha','Abagana'],
'Bauchi':['Bauchi','Azare','Misau','Jama’are','Ningi','Katagum','Dass','Tafawa Balewa'],
'Bayelsa':['Yenagoa','Brass','Ogbia','Nembe','Sagbama','Kaiama','Oporoma','Amassoma'],
'Benue':['Makurdi','Gboko','Otukpo','Katsina-Ala','Adikpo','Vandeikya','Aliade','Logo','Ugbokolo'],
'Borno':['Maiduguri','Biu','Bama','Dikwa','Monguno','Gwoza','Konduga','Damboa'],
'Cross River':['Calabar','Ikom','Ogoja','Ugep','Obudu','Akamkpa','Obubra','Bakassi'],
'Delta':['Asaba','Warri','Sapele','Ughelli','Effurun','Agbor','Oleh','Ozoro','Abraka','Kwale'],
'Ebonyi':['Abakaliki','Afikpo','Onueke','Ezzamgbo','Ishielu','Uburu','Onicha'],
'Edo':['Benin City','Auchi','Ekpoma','Irrua','Uromi','Igarra','Sabongida-Ora','Ubiaja'],
'Ekiti':['Ado-Ekiti','Ikere-Ekiti','Iyin-Ekiti','Ijero-Ekiti','Oye-Ekiti','Ikole-Ekiti','Emure-Ekiti','Ilawe-Ekiti'],
'Enugu':['Enugu','Nsukka','Agbani','Udi','Oji River','Awgu','Eha Amufu','Nkanu'],
'Gombe':['Gombe','Kaltungo','Billiri','Bajoga','Dukku','Deba','Kumo','Pindiga'],
'Imo':['Owerri','Orlu','Okigwe','Mbaise','Oguta','Mbano','Nkwerre','Isu'],
'Jigawa':['Dutse','Hadejia','Kazaure','Gumel','Ringim','Birnin Kudu','Gwaram','Auyo'],
'Kaduna':['Kaduna','Zaria','Kafanchan','Kachia','Saminaka','Birnin Gwari','Jaji','Zonkwa'],
'Kano':['Kano','Wudil','Gwarzo','Bichi','Rano','Dawakin Kudu','Karaye','Kura'],
'Katsina':['Katsina','Daura','Funtua','Malumfashi','Dutsin-Ma','Kankia','Jibia','Mani'],
'Kebbi':['Birnin Kebbi','Argungu','Yauri','Zuru','Kamba','Jega','Koko','Dakingari'],
'Kogi':['Lokoja','Okene','Kabba','Idah','Ankpa','Anyigba','Ajaokuta','Dekina'],
'Kwara':['Ilorin','Offa','Jebba','Lafiagi','Omu-Aran','Patigi','Kaiama','Share'],
'Lagos':['Ikeja','Lagos Island','Victoria Island','Lekki','Epe','Badagry','Ikorodu','Surulere','Yaba','Agege','Alimosho','Ojo','Festac','Apapa'],
'Nasarawa':['Lafia','Keffi','Karu','Akwanga','Nasarawa','Doma','Wamba','Toto'],
'Niger':['Minna','Suleja','Bida','Kontagora','New Bussa','Lapai','Mokwa','Kagara'],
'Ogun':['Abeokuta','Ijebu-Ode','Sagamu','Ota','Ilaro','Ayetoro','Ifo','Ijebu-Igbo','Owode'],
'Ondo':['Akure','Ondo','Owo','Ikare-Akoko','Okitipupa','Ore','Idanre','Igbokoda'],
'Osun':['Osogbo','Ile-Ife','Ilesa','Ede','Iwo','Ikirun','Ejigbo','Oshogbo','Gbongan'],
'Oyo':['Ibadan','Ogbomoso','Oyo','Iseyin','Saki','Eruwa','Igbo-Ora','Kishi','Fiditi'],
'Plateau':['Jos','Bukuru','Barkin Ladi','Pankshin','Shendam','Mangu','Langtang','Vom'],
'Rivers':['Port Harcourt','Obio-Akpor','Bonny','Eleme','Okrika','Bori','Ahoada','Omoku','Degema'],
'Sokoto':['Sokoto','Tambuwal','Wurno','Bodinga','Gwadabawa','Illela','Kware','Yabo'],
'Taraba':['Jalingo','Wukari','Bali','等','Gembu','Serti','Takum','Zing','Karim Lamido'].filter(x=>x!=='等'),
'Yobe':['Damaturu','Potiskum','Gashua','Nguru','Geidam','Buni Yadi','Fika','Gujba'],
'Zamfara':['Gusau','Kaura Namoda','Talata Mafara','Anka','Bungudu','Maru','Tsafe','Zurmi'],
'Federal Capital Territory':['Abuja','Garki','Wuse','Maitama','Asokoro','Gwarinpa','Kubwa','Lugbe','Kuje','Bwari','Nyanya','Jikwoyi']
};
const stateSelect=document.querySelector('#state'),citySelect=document.querySelector('#city');Object.keys(places).sort((a,b)=>a==='Federal Capital Territory'?1:b==='Federal Capital Territory'?-1:a.localeCompare(b)).forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s;stateSelect.append(o)});
stateSelect.addEventListener('change',()=>{citySelect.innerHTML='<option value="">Select city / town</option>';citySelect.disabled=!stateSelect.value;(places[stateSelect.value]||[]).forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c;citySelect.append(o)});});
const fileInput=document.querySelector('#portfolioFiles'),fileList=document.querySelector('#fileList');fileInput.addEventListener('change',()=>{if(fileInput.files.length>10){alert('You can upload a maximum of 10 files.');fileInput.value='';fileList.textContent='';return;}fileList.textContent=[...fileInput.files].map(f=>`${f.name} (${(f.size/1024/1024).toFixed(1)} MB)`).join(' · ');});
const cfg=window.CACSF_CONFIG||{};const cloud=cfg.supabaseUrl&&cfg.supabaseAnonKey&&window.supabase;const sb=cloud?window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey):null;
const form=document.querySelector('#application');form.addEventListener('submit',async e=>{e.preventDefault();if(!form.reportValidity())return;const skills=[...form.querySelectorAll('input[name="skills"]:checked')].map(x=>x.value);if(!skills.length){alert('Please select at least one skill.');return;}const files=[...fileInput.files];if(files.length>10){alert('You can upload a maximum of 10 files.');return;}const f=new FormData(form);const state=f.get('state'),city=f.get('city');const data={full_name:f.get('full_name'),set_year:f.get('set_year'),phone:f.get('phone'),whatsapp:f.get('whatsapp'),email:f.get('email'),state,city,location:`${city}, ${state}`,bio:f.get('bio'),skills,portfolio:f.get('portfolio')||'',experience:f.get('experience'),portfolio_files:[],created_at:new Date().toISOString()};const btn=form.querySelector('.submit');btn.disabled=true;btn.textContent='Submitting…';try{if(sb){for(let i=0;i<files.length;i++){const file=files[i],safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_'),path=`${Date.now()}_${i}_${safe}`;const {error:upErr}=await sb.storage.from('applicant-portfolio').upload(path,file,{upsert:false});if(upErr)throw upErr;data.portfolio_files.push({name:file.name,path,size:file.size,type:file.type});}const {error}=await sb.from('applications').insert(data);if(error)throw error;}else{const list=JSON.parse(localStorage.getItem('cacsfApplications')||'[]');data.portfolio_files=files.map(file=>({name:file.name,size:file.size,type:file.type,note:'Demo mode: file metadata only; configure Supabase Storage for actual file uploads.'}));list.push({...data,id:crypto.randomUUID()});localStorage.setItem('cacsfApplications',JSON.stringify(list));}document.querySelector('#success').classList.add('show');form.reset();citySelect.innerHTML='<option value="">Select your state first</option>';citySelect.disabled=true;fileList.textContent='';}catch(err){alert('Submission failed. Please try again. '+(err.message||''));}finally{btn.disabled=false;btn.innerHTML='Submit application <span>↗</span>';}});
document.querySelector('#closeModal').addEventListener('click',()=>document.querySelector('#success').classList.remove('show'));
document.querySelector('#continueBtn').addEventListener('click',()=>{document.querySelector('#disclaimer').classList.remove('show');document.body.classList.remove('modal-open');});document.body.classList.add('modal-open');
