# Introduction

This document will explain, to those unfamiliar with Ansible, how they can get an Ansible environment set-up quickly, with the end goal of deploying Ballerine.
It is a quick, dirty HowTo format, not intended to teach you Ansible's full capabilities. Ansible is an incredible tool, with great documentation, a welcoming community, and it's all very easy to pick up - not to mention extremely powerful and suited for just about any situation.

# Operational Overview

Ansible works on a "push to clients" basis. You have your control node, which pushes all the configuration/ad-hoc tasks out to your systems via SSH, with no client running on the systems you're deploying to! This model means it's very fast, efficient, secure, scalable, and extremely portable.
So, to control remote systems, you only need to install Ansible on your control node - your own desktop would make a great control node to deploy from

# Getting Ansible

It's recommended that you check out Ansible's official documentation on installing (it's really easy!), but here's a quick rundown of installation methods:

## Package manager

If you're running a UNIX-like system, like Linux or BSD, Ansible is likely available in your official package repositories. Use your package manager to see if it's available, and if so, install it! Ansible's installation documentation has a section on this - just scroll down until you see your OS.

## Via Pip

Ansible is written in Python, so, it's only natural that it be available for install via pip. If you have pip installed, it's as easy as:

```
$ sudo pip install ansible
```

If not, check to see if you can install pip via your system's package manager (you want the Python 2.7 version!).
Or, if you're on Mac OS X, and you're not using Homebrew or pkgsrc, you should be able to install pip using easy_install, like so:

```
$ sudo easy_install pip
```

then

```
$ sudo pip install ansible
```

# Simple Deployment Environment for Ballerine

So, now you've got Ansible installed, you can get ready to deploy Ballerine!

## Prerequisites

- You must have SSH access to the system you want to deploy to as the root user.

## Inventory set-up

First you will need to clone the Ballerine repository to your machine & move to the ansible playbook folder

```bash
$ git clone https://github.com/ballerine-io/ballerine.git
$ cd deploy/ansible/ballerine_playbook
```


Make the inventory file `inventory`, for simplicity's sake:

```bash
$ touch inventory
```

Now, with your editor, open the file and add the hostname or FQDN of the server(s) you want to deploy Ballerine to with the following pattern:

```bash
all ansible_host={{ SERVER_HOST }} ansible_port={{ SERVER_PORT }} ansible_user={{ SERVER_USER }}
```

If you are using SSH keypairs for authenticating your SSH connections to your server. You can tell Ansible your ssh private key file in the `inventory` file
using `ansible_ssh_private_key_file`

```bash
all ansible_host={{ SERVER_HOST }} ansible_port={{ SERVER_PORT }} ansible_user={{ SERVER_USER }} ansible_ssh_private_key_file={{ SSH_PRIVATE_KEY_FILE }}
```

After you completed the above step then we're pretty much done with the inventory

## Setup your configuration vars for Ballerine

The next step is to setup necessary configuration for your app to run such as environment variable, domain name, etc.

First you need to open `deploy/ansible/ballerine_playbook/roles/setup-ballerine/defaults/main.yml` file with your editor.  
There are some variables that will need input from you to get the application start correctly

- `install_dir`: The absolute path of your app's installation folder on the server (required). Default: `/home/ubuntu/ballerine`
- `vite_api_url`: Incase you want to deploy ballerine on a remote server and run it on HTTPS
- `backoffice_url`: URL you wish to deploy Case-Management on
- `kyb_url`: URL you wish to deploy KYB on
- `workflow_dashboard_url`: URL you wish to deploy Workflows-Dashboard on
- `workflow_svc_url`: URL you wish to deploy Workflows-Service on

Once you complete setup config vars for your app then we are ready to deploy our app on your server.

## Run the Ansible playbook

After complete the above step. Now the only remain step we need to do is run the ansible playbook.
You can run the ansible playbook with the following command

```bash
cd ballerine/deploy/ansible/ballerine_playbook
ansible-playbook -i inventory.txt ballerine-playbook.yml --skip-tags packer
```

The command above will use the host information from the `inventory` file.

When it's all done, provided all went well and no parameters were changed, you should be able to visit your app on browser using your `vite_api_url`

**Note**: You can put your `inventory` file in other folder and then specify its path with the `-i` flag, for detail, check [Ansible Inventory documentation](https://docs.ansible.com/ansible/latest/user_guide/intro_inventory.html)

## Make entries to the DNS server

Make sure the appropriate entries for the url in DNS are created
