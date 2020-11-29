""" test tool utils """
from duckdown.tool.provision import route53_tools


def test_extract_domain():
    """ test my python chunking """
    assert (
        route53_tools._extract_domain_("site.blueshed.info") == "blueshed.info"
    )


def test_hosted_zone():
    """ can we get hosted zone id """
    assert (
        route53_tools.get_hosted_zone_id("blueshed.info")
        == "/hostedzone/Z137Y8OFTAZYW0"
    )
