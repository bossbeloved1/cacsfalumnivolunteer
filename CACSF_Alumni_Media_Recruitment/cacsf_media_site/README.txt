CACSF ALUMNI FELLOWSHIP MEDIA UNIT - RECRUITMENT WEBSITE

PUBLIC APPLICATION
- Open index.html using VS Code Live Server or deploy the folder to HTTPS hosting.
- Visitors first see the voluntary-service disclaimer. Selecting “Click here to continue” reveals the application form.
- There is no dashboard link on the public website.
- The form includes Nigerian state and city/town selection, alumni sets from 1995/1996 through the current academic set, skill selection, an optional portfolio link, and up to 10 optional work-sample uploads. CV upload is not included.
- All form fields except the optional portfolio URL and optional work-sample uploads are required.

SUPABASE CONNECTION
- config.js is preconfigured with the supplied project URL and publishable key.
- The publishable key is intended for browser use. Never place a Supabase secret/service-role key in frontend files.
- Supabase Auth and Row Level Security control access; the publishable key alone does not grant administrator access.
- The project URL is https://btkvvnswaaojywksldoo.supabase.co.

ADMIN DASHBOARD
- admin.html is a separate admin-only page. Do not add a public navigation link to it.
- The dashboard signs in with Supabase Auth, then checks that the signed-in user has a row in public.media_admins before showing applications.
- Current administrator structure: one super_admin and two admin accounts; two additional slots remain available, for a maximum of five accounts.
- Only add approved administrator UUIDs to public.media_admins. Do not enable public admin registration.
- Admins can review applications and export applicant data to CSV. Portfolio uploads are stored in the private applicant-portfolio bucket and opened using temporary signed links.

DATABASE SETUP ALREADY COMPLETED IN SUPABASE
- The project owner has run the SQL setup and assigned one super_admin and two admin roles.
- The applications table, media_admins table, RLS policies and private applicant-portfolio bucket should exist.
- If a live request fails, check Supabase Table Editor, Authentication > Users, Storage and SQL policies before changing the schema.

DEPLOYMENT
1. Keep config.js with the public project URL and publishable key.
2. Deploy the complete cacsf_media_site folder to an HTTPS host (not just index.html).
3. In Supabase Authentication > URL Configuration, add the deployed site URL as the Site URL and add any required redirect URLs.
4. Test one real application and verify it appears in Table Editor > applications.
5. Test an uploaded sample and verify it appears in Storage > applicant-portfolio.
6. Test each of the three admin accounts. A non-admin Auth user must not be able to view the dashboard data.

UPLOAD NOTES
- Maximum 10 files per application.
- Maximum 25 MB per file (bucket setting).
- Supported formats include common images, PDF, Word, PowerPoint, ZIP and MP4/MOV video.
- Portfolio URL and work-sample uploads are optional. CV is not requested.

BRANDING
- Replace assets/logo.png and assets/logoextension.png with your own logo files when ready.
