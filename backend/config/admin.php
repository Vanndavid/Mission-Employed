<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Bootstrap admin
    |--------------------------------------------------------------------------
    |
    | The `admin:bootstrap` command reconciles this account on every boot, the
    | way the retired Express server did. A deployment has no other way to make
    | the first admin: registration always produces a free `user`, and an admin
    | is the only role that can upgrade a plan, so without this a fresh
    | container would come up with nobody able to administer it.
    |
    | Leave either value empty to skip the command entirely -- that is what
    | keeps local and test environments from growing a surprise admin.
    |
    */

    'email' => env('ADMIN_EMAIL'),

    'password' => env('ADMIN_PASSWORD'),

    'name' => env('ADMIN_NAME', 'Mission Control'),

];
