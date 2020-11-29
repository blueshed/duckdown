""" route53 tools """
import logging
import boto3
from tld import get_tld
from .store import store
from .utils import get_aws_region_account

LOGGER = logging.getLogger(__name__)


def check_available(domain):
    """ check the availability of domain with route53 """

    # check with route53
    client = boto3.client("route53domains", region_name="us-east-1")
    availability = client.check_domain_availability(DomainName=domain)

    LOGGER.debug(availability)

    # store in provision
    availability["domain"] = domain
    store(domain, availability)

    return availability


def get_domains():
    """ list domains """
    client = boto3.client("route53", region_name="us-east-1")
    response = client.get_domains()
    LOGGER.debug(response)
    domains = response["Domains"]
    store("domains", domains)
    return response


def get_hosted_zones():
    """ list domains """
    client = boto3.client("route53", region_name="us-east-1")
    response = client.list_hosted_zones()
    LOGGER.debug(response)
    zones = response["HostedZones"]
    store("zones", zones)
    return zones


def get_hosted_zone_id(name):
    """ return the id of hosted zone """
    # for some reason domain hosted zone end with .
    key = f"{name}."
    for zone in get_hosted_zones():
        print(zone)
        if zone["Name"] == key:
            return zone["Id"]
    raise ValueError(f"No zone called {name}")


def _extract_domain_(bucket_name):
    """ return the domain part of bucket_name """
    res = get_tld(f"http://{bucket_name}", as_object=True)
    return res.fld


def set_website_cname(bucket_name):
    """ it is assumed that you bucket is a subdomain """

    region, _ = get_aws_region_account()

    domain = _extract_domain_(bucket_name)

    hosted_zone_id = get_hosted_zone_id(domain)

    target = f"http://{bucket_name}.s3-website-{region}.amazonaws.com"

    client = boto3.client("route53", region_name="us-east-1")
    change_batch = {
        "Comment": "add %s -> %s" % (bucket_name, target),
        "Changes": [
            {
                "Action": "UPSERT",
                "ResourceRecordSet": {
                    "Name": bucket_name,
                    "Type": "CNAME",
                    "TTL": 300,
                    "ResourceRecords": [{"Value": target}],
                },
            }
        ],
    }
    store(f"cname-{bucket_name}", change_batch)
    response = client.change_resource_record_sets(
        HostedZoneId=hosted_zone_id, ChangeBatch=change_batch
    )
    LOGGER.debug(response)
    return response


def request_acm_certificate(bucket_name, transaction):
    """ request an ssl certificate from ACM """

    client = boto3.client("ACM")
    response = client.request_certificate(
        DomainName=bucket_name,
        ValidationMethod="DNS",
        IdempotencyToken=transaction,
        DomainValidationOptions=[
            {"DomainName": "string", "ValidationDomain": "string"},
        ],
        Options={"CertificateTransparencyLoggingPreference": "ENABLED"},
        CertificateAuthorityArn="string",
    )
    LOGGER.debug(response)
    return response
