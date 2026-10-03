function Get-Token($email) {
    $res = Invoke-RestMethod -Uri "http://localhost:5000/api/auth/login" -Method Post -ContentType "application/json" -Body "{`"email`":`"$email`",`"password`":`"Admin@123`"}"
    return $res.data.access_token
}

Write-Host "Obtaining JWT tokens for all 4 roles..."
$tokens = @{
    "super-admin" = Get-Token "admin@rojgarresult.com"
    "publisher"   = Get-Token "publisher@rojgarresult.com"
    "editor"      = Get-Token "editor@rojgarresult.com"
    "viewer"      = Get-Token "viewer@rojgarresult.com"
}
Write-Host "✅ Obtained tokens for all 4 roles."

function Test-RBAC($role, $method, $url, $body=$null, $expectedStatus) {
    $h = if ($role -eq "unauth") { @{} } else { @{ "Authorization" = "Bearer " + $tokens[$role] } }
    try {
        $p = @{ Uri = $url; Method = $method; ContentType = "application/json"; Headers = $h }
        if ($body) { $p["Body"] = $body }
        $res = Invoke-WebRequest @p
        $pass = ($res.StatusCode -eq $expectedStatus)
        return [PSCustomObject]@{ Role = $role; Method = $method; Endpoint = $url.Replace("http://localhost:5000/api",""); Expected = $expectedStatus; Actual = $res.StatusCode; Result = if ($pass) { "PASS" } else { "FAIL" } }
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        $pass = ($status -eq $expectedStatus)
        return [PSCustomObject]@{ Role = $role; Method = $method; Endpoint = $url.Replace("http://localhost:5000/api",""); Expected = $expectedStatus; Actual = $status; Result = if ($pass) { "PASS" } else { "FAIL" } }
    }
}

$results = @()

# First, create a test job with super-admin to test updates/deletes
$adminToken = $tokens["super-admin"]
$adminHeaders = @{ "Authorization" = "Bearer $adminToken" }
$testJob = Invoke-RestMethod -Uri "http://localhost:5000/api/jobs" -Method Post -ContentType "application/json" -Headers $adminHeaders -Body '{"title":"RBAC Test Job","slug":"rbac-test-job"}'
$jobId = $testJob.data._id

# Create a test contact query with subject & message >= 10 chars
$randContact = Get-Random
$contactQuery = Invoke-RestMethod -Uri "http://localhost:5000/api/contact" -Method Post -ContentType "application/json" -Body "{`"name`":`"Test Contact`",`"email`":`"test_$randContact@contact.com`",`"subject`":`"General Inquiry`",`"message`":`"Hello world from contact form`"}"
$contactId = $contactQuery.data._id

Write-Host "--- 1. VIEWER ROLE TESTS (Expect 403 Forbidden for all writes) ---"
$results += Test-RBAC "viewer" "Post" "http://localhost:5000/api/jobs" '{"title":"Viewer Job","slug":"viewer-job"}' 403
$results += Test-RBAC "viewer" "Patch" "http://localhost:5000/api/jobs/id/$jobId" '{"title":"Viewer Update"}' 403
$results += Test-RBAC "viewer" "Delete" "http://localhost:5000/api/jobs/id/$jobId" $null 403
$results += Test-RBAC "viewer" "Post" "http://localhost:5000/api/organizations" '{"name":"Viewer Org"}' 403
$results += Test-RBAC "viewer" "Post" "http://localhost:5000/api/users" '{"name":"Viewer User","email":"v@test.com","password":"Password123","role":"viewer"}' 403

Write-Host "--- 2. EDITOR ROLE TESTS (Can create/edit jobs, CANNOT delete jobs or create orgs/users) ---"
$randEd = Get-Random
$results += Test-RBAC "editor" "Post" "http://localhost:5000/api/jobs" "{`"title`":`"Editor Job`",`"slug`":`"editor-job-$randEd`"}" 201
$results += Test-RBAC "editor" "Patch" "http://localhost:5000/api/jobs/id/$jobId" '{"title":"Editor Update Job"}' 200
$results += Test-RBAC "editor" "Delete" "http://localhost:5000/api/jobs/id/$jobId" $null 403  # MUST BE 403
$results += Test-RBAC "editor" "Post" "http://localhost:5000/api/organizations" '{"name":"Editor Org"}' 403  # MUST BE 403
$results += Test-RBAC "editor" "Post" "http://localhost:5000/api/users" '{"name":"Editor User","email":"e@test.com","password":"Password123","role":"editor"}' 403  # MUST BE 403

Write-Host "--- 3. PUBLISHER ROLE TESTS (Can create/edit/delete jobs & orgs, CANNOT create users) ---"
$randPub = Get-Random
$results += Test-RBAC "publisher" "Post" "http://localhost:5000/api/jobs" "{`"title`":`"Publisher Job`",`"slug`":`"pub-job-$randPub`"}" 201
$results += Test-RBAC "publisher" "Post" "http://localhost:5000/api/organizations" "{`"name`":`"Publisher Org $randPub`"}" 201
$results += Test-RBAC "publisher" "Post" "http://localhost:5000/api/users" '{"name":"Pub User","email":"p@test.com","password":"Password123","role":"editor"}' 403  # MUST BE 403

Write-Host "--- 4. SUPER-ADMIN ROLE TESTS (Can manage everything including user creation) ---"
$randSa = Get-Random
$results += Test-RBAC "super-admin" "Post" "http://localhost:5000/api/users" "{`"name`":`"Super Admin Created User`",`"email`":`"created_$randSa@test.com`",`"password`":`"Password123`",`"role`":`"editor`"}" 201
$results += Test-RBAC "super-admin" "Delete" "http://localhost:5000/api/jobs/id/$jobId" $null 200

Write-Host "--- 5. INTENTIONALLY PUBLIC ROUTE REGRESSION TESTS (No token, must return 200/201) ---"
$results += Test-RBAC "unauth" "Get" "http://localhost:5000/api/faqs/public" $null 200
$results += Test-RBAC "unauth" "Post" "http://localhost:5000/api/contact" "{`"name`":`"Public Visitor`",`"email`":`"visitor_$randSa@test.com`",`"subject`":`"General Feedback`",`"message`":`"Hello world from public contact form`"}" 201
$results += Test-RBAC "unauth" "Get" "http://localhost:5000/api/jobs" $null 200
$results += Test-RBAC "unauth" "Get" "http://localhost:5000/api/organizations" $null 200
$results += Test-RBAC "unauth" "Get" "http://localhost:5000/api/job-categories" $null 200

Write-Host "--- 6. CONTACT ADMIN DELETE ROUTE TEST ---"
$results += Test-RBAC "unauth" "Delete" "http://localhost:5000/api/contact/$contactId" $null 401
$results += Test-RBAC "super-admin" "Delete" "http://localhost:5000/api/contact/$contactId" $null 204

$results | Format-Table -AutoSize
